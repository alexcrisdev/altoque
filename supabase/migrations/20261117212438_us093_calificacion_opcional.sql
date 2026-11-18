-- US-093: una valoración opcional por pedido, sin acceso directo del comensal.
create table public.order_ratings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  order_id uuid not null unique references public.orders(id),
  service_stars smallint not null check (service_stars between 1 and 5),
  waiter_stars smallint not null check (waiter_stars between 1 and 5),
  comment text check (comment is null or (char_length(comment) <= 200 and comment !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now()
);
create index order_ratings_restaurant_created on public.order_ratings(restaurant_id, created_at);
alter table public.order_ratings enable row level security;
revoke all on public.order_ratings from public, anon, authenticated, service_role;
grant select on public.order_ratings to authenticated;
create policy order_ratings_admin_read on public.order_ratings for select to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create function private.pedido_admite_calificacion(p_pedido uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.status <> 'CANCELLED' and (
    o.status = 'DELIVERED' or (
      exists (select 1 from public.payments p where p.restaurant_id = o.restaurant_id
        and p.status = 'CONFIRMED' and (p.table_session_id = o.table_session_id or p.order_id = o.id))
      and case when o.table_session_id is not null
        then private.saldo_pendiente_sesion(o.table_session_id)
        else private.saldo_pendiente_pedido(o.id) end = 0
    )) from public.orders o where o.id = p_pedido), false);
$$;
revoke all on function private.pedido_admite_calificacion(uuid) from public, anon, authenticated;

-- El QR y la clave se validan de nuevo dentro de la base. Nunca se acepta un
-- restaurante o identificador de pedido proporcionado por el navegador.
create function public.estado_calificacion_cliente(p_qr_id uuid, p_clave uuid)
returns table(disponible boolean, calificada boolean)
language sql stable security definer set search_path = '' as $$
  select private.pedido_admite_calificacion(o.id)
      and not exists (select 1 from public.order_ratings r where r.order_id = o.id),
    exists (select 1 from public.order_ratings r where r.order_id = o.id)
  from public.orders o
  join public.qr_codes q on q.id = o.qr_code_id and q.restaurant_id = o.restaurant_id
  join public.branches b on b.id = q.branch_id and b.restaurant_id = q.restaurant_id
  join public.restaurants rest on rest.id = q.restaurant_id
  left join public.dining_tables mesa on mesa.id = q.dining_table_id
  where q.id = p_qr_id and o.idempotency_key = p_clave and q.active and b.active and rest.active
    and (q.purpose = 'TAKEAWAY' or mesa.active);
$$;
revoke all on function public.estado_calificacion_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.estado_calificacion_cliente(uuid, uuid) to service_role;

create function public.calificar_pedido_cliente(
  p_qr_id uuid, p_clave uuid, p_servicio smallint, p_mesero smallint, p_comentario text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
  v_id uuid;
begin
  if p_servicio is null or p_servicio not between 1 and 5
    or p_mesero is null or p_mesero not between 1 and 5
    or (p_comentario is not null and (char_length(p_comentario) > 200 or p_comentario ~ '[[:cntrl:]]')) then
    raise exception 'INVALID_RATING' using errcode = '22023';
  end if;
  select o.* into v_pedido from public.orders o
    join public.qr_codes q on q.id = o.qr_code_id and q.restaurant_id = o.restaurant_id
    join public.branches b on b.id = q.branch_id and b.restaurant_id = q.restaurant_id
    join public.restaurants rest on rest.id = q.restaurant_id
    left join public.dining_tables mesa on mesa.id = q.dining_table_id
    where q.id = p_qr_id and o.idempotency_key = p_clave and q.active and b.active and rest.active
      and (q.purpose = 'TAKEAWAY' or mesa.active)
    for update of o;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.order_ratings r where r.order_id = v_pedido.id) then
    raise exception 'ALREADY_RATED' using errcode = '23505';
  end if;
  if not private.pedido_admite_calificacion(v_pedido.id) then
    raise exception 'RATING_NOT_AVAILABLE' using errcode = '22023';
  end if;
  insert into public.order_ratings(restaurant_id, order_id, service_stars, waiter_stars, comment)
    values(v_pedido.restaurant_id, v_pedido.id, p_servicio, p_mesero, nullif(trim(p_comentario), ''))
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.calificar_pedido_cliente(uuid, uuid, smallint, smallint, text) from public, anon, authenticated;
grant execute on function public.calificar_pedido_cliente(uuid, uuid, smallint, smallint, text) to service_role;
