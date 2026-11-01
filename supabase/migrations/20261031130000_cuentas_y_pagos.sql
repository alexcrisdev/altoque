-- US-021: cuenta y saldo pendiente.
-- La cuenta de una mesa es su sesión (todos sus pedidos no cancelados).
-- La cuenta de un pedido para llevar es el propio pedido.
-- saldo = consumo - pagos CONFIRMADOS.

-- Pagos. Esta historia solo crea la tabla para poder calcular el saldo;
-- el registro de pagos (efectivo, Yape, tarjeta) llega en US-022 a US-024.
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id),
  table_session_id uuid references public.table_sessions(id),
  order_id         uuid references public.orders(id),
  method           text not null check (method in ('CASH', 'YAPE', 'CARD')),
  status           text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  amount           numeric(12,2) not null check (amount > 0),
  idempotency_key  uuid not null,
  created_by       uuid not null references public.users(id),
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  -- Un pago es de una mesa (sesión) o de un pedido para llevar, nunca de ambos.
  check ((table_session_id is null) <> (order_id is null)),
  check ((status = 'CONFIRMED') = (confirmed_at is not null)),
  -- El mismo cajero con la misma clave es el mismo pago (reintentos).
  unique (created_by, idempotency_key)
);

create index payments_table_session_idx on public.payments (table_session_id) where table_session_id is not null;
create index payments_order_idx on public.payments (order_id) where order_id is not null;
create index payments_restaurant_created_idx on public.payments (restaurant_id, created_at desc);
create index orders_table_session_idx on public.orders (table_session_id) where table_session_id is not null;

alter table public.payments enable row level security;

-- Solo quienes cobran pueden ver los pagos. No hay políticas de insert/update/delete:
-- los pagos se registrarán solo mediante funciones del servidor.
create policy payments_read_cobro on public.payments
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'WAITER', 'OWNER', 'ADMIN'])));

-- Saldo pendiente de una mesa: precios guardados en cada línea (los del momento
-- del pedido), sin pedidos cancelados, menos los pagos confirmados.
create or replace function private.saldo_pendiente_sesion(p_sesion_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(oi.unit_price * oi.quantity)
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        where o.table_session_id = p_sesion_id and o.status <> 'CANCELLED'
    ), 0)
    - coalesce((
      select sum(p.amount)
        from public.payments p
        where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED'
    ), 0);
$$;

revoke all on function private.saldo_pendiente_sesion(uuid) from public, anon, authenticated;

-- No se puede cerrar ordinariamente una mesa con saldo pendiente.
-- (La excepción autorizada con motivo se agrega en US-020.)
create or replace function private.impedir_cierre_con_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.closed_at is null and new.closed_at is not null
    and private.saldo_pendiente_sesion(old.id) > 0 then
    raise exception 'SALDO_PENDIENTE' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.impedir_cierre_con_saldo() from public, anon, authenticated;

create trigger table_sessions_impedir_cierre_con_saldo
  before update on public.table_sessions
  for each row execute function private.impedir_cierre_con_saldo();
