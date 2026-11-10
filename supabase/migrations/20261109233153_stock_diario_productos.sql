-- US-067: disponibilidad diaria por plato. Una fila por restaurante/producto/día.
-- El día se entrega desde el servidor en America/Lima. La unicidad permite que
-- US-078 descuente vendidos mediante un UPDATE atómico sobre esta fila.
create table public.product_daily_stock (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null,
  stock_date date not null,
  quantity integer not null check (quantity >= 0),
  sold integer not null default 0 check (sold >= 0 and sold <= quantity),
  created_at timestamptz not null default now(),
  unique (restaurant_id, product_id, stock_date),
  foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id) on delete cascade
);

create index product_daily_stock_day_idx
  on public.product_daily_stock (restaurant_id, stock_date);

alter table public.product_daily_stock enable row level security;

create policy product_daily_stock_read_member on public.product_daily_stock
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy product_daily_stock_insert_admin on public.product_daily_stock
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy product_daily_stock_update_admin on public.product_daily_stock
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy product_daily_stock_delete_admin on public.product_daily_stock
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

grant select, insert, update, delete on public.product_daily_stock to authenticated;

-- Guarda el formulario completo dentro de una transacción. Una cantidad vacía
-- quita el límite del producto para ese día; una cantidad definida conserva
-- sold y se rechaza si ya se vendieron más platos.
create or replace function public.guardar_stock_diario(
  p_restaurant_id uuid,
  p_stock_date date,
  p_items jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
  v_limitados integer;
  v_afectados integer;
begin
  if not private.has_role(p_restaurant_id, array['OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_stock_date is null or p_stock_date <> (now() at time zone 'America/Lima')::date
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_STOCK' using errcode = '22023';
  end if;

  select count(*)::integer into v_total from jsonb_array_elements(p_items);
  if exists (
    select 1 from jsonb_array_elements(p_items) i(value)
    where (i.value->>'productoId') is null
      or (i.value->>'productoId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (i.value->>'cantidad') is not null and (i.value->>'cantidad') !~ '^(0|[1-9][0-9]*)$'
  ) or (select count(distinct i.value->>'productoId') from jsonb_array_elements(p_items) i(value)) <> v_total then
    raise exception 'INVALID_STOCK' using errcode = '22023';
  end if;

  if v_total <> (select count(*)::integer from public.products p
      where p.restaurant_id = p_restaurant_id and p.active)
    or exists (
      select 1 from jsonb_array_elements(p_items) i(value)
      left join public.products p on p.id = (i.value->>'productoId')::uuid
        and p.restaurant_id = p_restaurant_id and p.active
      where p.id is null
    ) then
    raise exception 'INVALID_PRODUCT' using errcode = '23514';
  end if;

  -- No borrar el contador del día si hubo ventas: volver a registrar stock
  -- iniciaría sold en cero y permitiría fijar un límite menor al ya vendido.
  if exists (
    select 1
    from public.product_daily_stock s
    join jsonb_array_elements(p_items) i(value)
      on s.product_id = (i.value->>'productoId')::uuid
    where s.restaurant_id = p_restaurant_id and s.stock_date = p_stock_date
      and i.value->>'cantidad' is null and s.sold > 0
  ) then
    raise exception 'STOCK_ALREADY_SOLD' using errcode = '23514';
  end if;

  delete from public.product_daily_stock s
    using jsonb_array_elements(p_items) i(value)
    where s.restaurant_id = p_restaurant_id and s.stock_date = p_stock_date
      and s.product_id = (i.value->>'productoId')::uuid and i.value->>'cantidad' is null;

  select count(*)::integer into v_limitados from jsonb_array_elements(p_items) i(value)
    where i.value->>'cantidad' is not null;
  insert into public.product_daily_stock (restaurant_id, product_id, stock_date, quantity)
    select p_restaurant_id, (i.value->>'productoId')::uuid, p_stock_date, (i.value->>'cantidad')::integer
    from jsonb_array_elements(p_items) i(value)
    where i.value->>'cantidad' is not null
    on conflict (restaurant_id, product_id, stock_date) do update
      set quantity = excluded.quantity
      where product_daily_stock.sold <= excluded.quantity;
  get diagnostics v_afectados = row_count;
  if v_afectados <> v_limitados then
    raise exception 'STOCK_BELOW_SOLD' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.guardar_stock_diario(uuid, date, jsonb) from public, anon;
grant execute on function public.guardar_stock_diario(uuid, date, jsonb) to authenticated;
