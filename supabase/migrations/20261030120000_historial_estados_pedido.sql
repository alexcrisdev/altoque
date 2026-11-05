-- US-010: historial auditable y transiciones válidas de los pedidos.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'));

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.users(id) on delete set null,
  reason text check (reason is null or length(reason) <= 200),
  created_at timestamptz not null default now()
);

create index order_status_history_order_created_idx
  on public.order_status_history (order_id, created_at);

alter table public.order_status_history enable row level security;
create policy order_status_history_read_admin on public.order_status_history
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create or replace function public.registrar_estado_inicial_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by)
  values (new.id, new.restaurant_id, null, new.status, new.created_by);
  return new;
end;
$$;

create trigger orders_registrar_estado_inicial
  after insert on public.orders
  for each row execute function public.registrar_estado_inicial_pedido();

create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado text,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(p_motivo), '');
  v_roles text[];
begin
  if v_user is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
    where id = p_pedido_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_reason is not null and length(v_reason) > 200 then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;

  if (v_order.status, p_estado) in (
    ('PENDING', 'ACCEPTED'), ('ACCEPTED', 'IN_PROGRESS'), ('IN_PROGRESS', 'READY'),
    ('READY', 'DELIVERED'), ('PENDING', 'CANCELLED'), ('ACCEPTED', 'CANCELLED'),
    ('IN_PROGRESS', 'CANCELLED')
  ) then
    null;
  else
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  if p_estado = 'CANCELLED' then
    if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  end if;

  if p_estado in ('ACCEPTED', 'IN_PROGRESS', 'READY') then
    v_roles := array['KITCHEN', 'OWNER', 'ADMIN'];
  elsif p_estado = 'DELIVERED' or v_order.status in ('PENDING', 'ACCEPTED') and p_estado = 'CANCELLED' then
    v_roles := array['WAITER', 'OWNER', 'ADMIN'];
  else
    v_roles := array['OWNER', 'ADMIN'];
  end if;

  if not private.has_role(v_order.restaurant_id, v_roles) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.orders set status = p_estado where id = v_order.id;
  insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, reason)
  values (v_order.id, v_order.restaurant_id, v_order.status, p_estado, v_user, v_reason);
  return p_estado;
end;
$$;

revoke all on function public.registrar_estado_inicial_pedido() from public, anon, authenticated;
revoke all on function public.cambiar_estado_pedido(uuid, text, text) from public, anon;
grant execute on function public.cambiar_estado_pedido(uuid, text, text) to authenticated;
