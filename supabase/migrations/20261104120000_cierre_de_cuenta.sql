-- US-020: cerrar la cuenta después del pago.
-- Cada cierre queda registrado (quién, cuándo e importes) en account_closures.
--   Ordinario: saldo pendiente en cero (o a favor del cliente) y sin pagos por verificar.
--   Excepción: queda saldo, solo dueño o admin, con motivo escrito.
-- El cierre no cambia el estado de preparación de los pedidos: pago y cocina van por separado.

create table public.account_closures (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id),
  table_session_id uuid unique references public.table_sessions(id),
  order_id         uuid unique references public.orders(id),
  kind             text not null check (kind in ('ORDINARY', 'EXCEPTION')),
  consumption      numeric(12,2) not null,  -- importe final consumido (sin cancelados)
  paid             numeric(12,2) not null,  -- pagos confirmados
  balance          numeric(12,2) not null,  -- saldo al cerrar (consumo - pagado)
  reason           text,
  closed_by        uuid not null references public.users(id),
  closed_at        timestamptz not null default now(),
  -- Un cierre es de una mesa (sesión) o de un pedido para llevar, nunca de ambos.
  check ((table_session_id is null) <> (order_id is null)),
  check (balance = consumption - paid),
  -- La excepción siempre lleva motivo y solo existe si quedaba saldo.
  check (
    (kind = 'ORDINARY' and reason is null and balance <= 0)
    or (kind = 'EXCEPTION' and balance > 0 and char_length(reason) between 10 and 300)
  )
);

create index account_closures_restaurant_closed_idx on public.account_closures (restaurant_id, closed_at desc);

alter table public.account_closures enable row level security;

-- Lo ve quien cobra. No hay políticas de escritura: solo las funciones del servidor.
create policy account_closures_read_cobro on public.account_closures
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'WAITER', 'OWNER', 'ADMIN'])));

-- Consumo y pagado de una cuenta, en una sola consulta.
create or replace function private.importes_cuenta(p_sesion_id uuid, p_pedido_id uuid)
returns table (consumo numeric, pagado numeric)
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
        where o.status <> 'CANCELLED'
          and (o.table_session_id = p_sesion_id or o.id = p_pedido_id)
    ), 0),
    coalesce((
      select sum(p.amount)
        from public.payments p
        where p.status = 'CONFIRMED'
          and (p.table_session_id = p_sesion_id or p.order_id = p_pedido_id)
    ), 0);
$$;

revoke all on function private.importes_cuenta(uuid, uuid) from public, anon, authenticated;

-- Reemplaza la regla de US-021. Al cerrar una mesa:
--   - Con un pago por verificar (Yape pendiente) no se cierra: primero se confirma o rechaza.
--   - Con saldo pendiente solo se cierra si cerrar_cuenta ya registró una excepción.
create or replace function private.impedir_cierre_con_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.closed_at is null and new.closed_at is not null then
    if exists (select 1 from public.payments p where p.table_session_id = old.id and p.status = 'PENDING') then
      raise exception 'PENDING_PAYMENTS' using errcode = '23514';
    end if;
    if private.saldo_pendiente_sesion(old.id) > 0 and not exists (
      select 1 from public.account_closures c where c.table_session_id = old.id and c.kind = 'EXCEPTION'
    ) then
      raise exception 'SALDO_PENDIENTE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Si la mesa se cierra por otro camino (botón del mesero, US-036), el cierre
-- ordinario igual queda registrado con quién, cuándo y los importes.
create or replace function private.registrar_cierre_sesion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumo numeric;
  v_pagado  numeric;
begin
  if old.closed_at is null and new.closed_at is not null
    and not exists (select 1 from public.account_closures c where c.table_session_id = new.id) then
    select consumo, pagado into v_consumo, v_pagado from private.importes_cuenta(new.id, null);
    insert into public.account_closures (restaurant_id, table_session_id, kind, consumption, paid, balance, closed_by, closed_at)
      values (new.restaurant_id, new.id, 'ORDINARY', v_consumo, v_pagado, v_consumo - v_pagado, new.closed_by, new.closed_at);
  end if;
  return null;
end;
$$;

revoke all on function private.registrar_cierre_sesion() from public, anon, authenticated;

create trigger table_sessions_registrar_cierre
  after update on public.table_sessions
  for each row execute function private.registrar_cierre_sesion();

-- Cierra una cuenta: una mesa (p_sesion_id) o un pedido para llevar (p_pedido_id).
-- Sin p_motivo es un cierre ordinario; con p_motivo es una excepción autorizada.
create or replace function public.cerrar_cuenta(p_sesion_id uuid, p_pedido_id uuid, p_motivo text)
returns table (cierre_id uuid, tipo text, consumo numeric, pagado numeric, saldo numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := (select auth.uid());
  v_restaurant uuid;
  v_motivo     text := nullif(btrim(p_motivo), '');
  v_consumo    numeric;
  v_pagado     numeric;
  v_tipo       text;
  v_cierre     public.account_closures%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (p_sesion_id is null) = (p_pedido_id is null) then
    raise exception 'INVALID_CLOSURE' using errcode = '22023';
  end if;

  -- Bloquea la cuenta igual que registrar_pago: un pago y un cierre a la vez se hacen en fila.
  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions
      where id = p_sesion_id and closed_at is null for update;
  else
    select restaurant_id into v_restaurant from public.orders
      where id = p_pedido_id and modality = 'TAKEAWAY' for update;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_restaurant, array['CASHIER', 'WAITER', 'OWNER', 'ADMIN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_closures c
               where c.table_session_id = p_sesion_id or c.order_id = p_pedido_id) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '22023';
  end if;

  -- Un pago sin verificar no es dinero recibido ni rechazado: no se cierra hasta resolverlo.
  if exists (select 1 from public.payments p
               where p.status = 'PENDING' and (p.table_session_id = p_sesion_id or p.order_id = p_pedido_id)) then
    raise exception 'PENDING_PAYMENTS' using errcode = '22023';
  end if;

  select i.consumo, i.pagado into v_consumo, v_pagado from private.importes_cuenta(p_sesion_id, p_pedido_id) i;

  if v_motivo is null then
    if v_consumo - v_pagado > 0 then raise exception 'SALDO_PENDIENTE' using errcode = '22023'; end if;
    v_tipo := 'ORDINARY';
  else
    if v_consumo - v_pagado <= 0 then raise exception 'EXCEPTION_NOT_NEEDED' using errcode = '22023'; end if;
    if not (select private.has_role(v_restaurant, array['OWNER', 'ADMIN'])) then
      raise exception 'EXCEPTION_FORBIDDEN' using errcode = '42501';
    end if;
    if char_length(v_motivo) not between 10 and 300 then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    v_tipo := 'EXCEPTION';
  end if;

  insert into public.account_closures (
    restaurant_id, table_session_id, order_id, kind, consumption, paid, balance, reason, closed_by
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, v_tipo, v_consumo, v_pagado, v_consumo - v_pagado, v_motivo, v_user
  )
  returning * into v_cierre;

  -- La mesa queda libre. Los triggers ven el cierre recién guardado.
  if p_sesion_id is not null then
    update public.table_sessions set closed_at = v_cierre.closed_at, closed_by = v_user where id = p_sesion_id;
  end if;

  return query select v_cierre.id, v_cierre.kind, v_cierre.consumption, v_cierre.paid, v_cierre.balance;
end;
$$;

revoke all on function public.cerrar_cuenta(uuid, uuid, text) from public, anon;
grant execute on function public.cerrar_cuenta(uuid, uuid, text) to authenticated;

-- Una cuenta cerrada ya no recibe pagos ni cambios en sus productos.
-- (Las mesas ya lo cumplían: registrar_pago exige la sesión abierta y no se piden
-- pedidos en una mesa cerrada. Esto cubre los pedidos para llevar.)
create or replace function private.impedir_cambios_cuenta_cerrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido uuid := case when tg_table_name = 'payments' then new.order_id
                        when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  if v_pedido is not null and exists (select 1 from public.account_closures c where c.order_id = v_pedido) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.impedir_cambios_cuenta_cerrada() from public, anon, authenticated;

create trigger payments_impedir_cuenta_cerrada
  before insert on public.payments
  for each row execute function private.impedir_cambios_cuenta_cerrada();

create trigger order_items_impedir_cuenta_cerrada
  before insert or update or delete on public.order_items
  for each row execute function private.impedir_cambios_cuenta_cerrada();
