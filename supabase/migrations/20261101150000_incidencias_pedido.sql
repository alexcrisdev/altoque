create table public.order_incidents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null check (type in (
    'FALTANTE', 'ERROR', 'RECLAMO', 'OTRO', 'SIN_INGREDIENTES', 'PROBLEMA_PREPARACION'
  )),
  description text not null check (length(description) between 3 and 300),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  check ((status = 'RESOLVED') = (resolved_at is not null))
);

create index order_incidents_order_created_idx on public.order_incidents (order_id, created_at);
alter table public.order_incidents enable row level security;
revoke all on public.order_incidents from public, anon, authenticated;
grant select on public.order_incidents to authenticated;
create policy order_incidents_read_staff on public.order_incidents
  for select to authenticated
  using (
    (select private.has_role(restaurant_id, array['WAITER', 'KITCHEN', 'OWNER', 'ADMIN']))
    and exists (
      select 1 from public.orders as order_row
      where order_row.id = order_incidents.order_id
        and order_row.restaurant_id = order_incidents.restaurant_id
    )
  );

create or replace function public.registrar_incidencia(p_pedido_id uuid, p_tipo text, p_descripcion text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_id uuid;
  v_description text := trim(p_descripcion);
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_pedido_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_order.restaurant_id, array['WAITER', 'KITCHEN', 'OWNER', 'ADMIN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in (
       'FALTANTE', 'ERROR', 'RECLAMO', 'OTRO', 'SIN_INGREDIENTES', 'PROBLEMA_PREPARACION'
     ) or v_description is null
     or length(v_description) not between 3 and 300 or v_order.status = 'CANCELLED' then
    raise exception 'INVALID_INCIDENT' using errcode = '22023';
  end if;
  insert into public.order_incidents (restaurant_id, order_id, type, description, created_by)
  values (v_order.restaurant_id, v_order.id, p_tipo, v_description, v_user) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.resolver_incidencia(p_incidencia_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_incident public.order_incidents%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_incident from public.order_incidents where id = p_incidencia_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_incident.restaurant_id, array['WAITER', 'KITCHEN', 'OWNER', 'ADMIN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_incident.status = 'RESOLVED' then raise exception 'ALREADY_RESOLVED' using errcode = '22023'; end if;
  update public.order_incidents set status = 'RESOLVED', resolved_by = v_user, resolved_at = now()
    where id = p_incidencia_id;
end;
$$;

revoke all on function public.registrar_incidencia(uuid, text, text) from public, anon;
revoke all on function public.resolver_incidencia(uuid) from public, anon;
grant execute on function public.registrar_incidencia(uuid, text, text) to authenticated;
grant execute on function public.resolver_incidencia(uuid) to authenticated;
