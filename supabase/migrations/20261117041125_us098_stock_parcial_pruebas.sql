-- US-098: sobrecarga explícita; conserva intacto el formulario completo de tres argumentos.
-- Solo modifica los productos indicados. No cambia sold ni los bloqueos de US-078.
begin;

create or replace function public.guardar_stock_diario(
  p_restaurant_id uuid,
  p_stock_date date,
  p_items jsonb,
  p_parcial boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_limitados integer;
  v_afectados integer;
begin
  if p_parcial is distinct from true then
    perform public.guardar_stock_diario(p_restaurant_id, p_stock_date, p_items);
    return;
  end if;
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

  if exists (
      select 1 from jsonb_array_elements(p_items) i(value)
      left join public.products p on p.id = (i.value->>'productoId')::uuid
        and p.restaurant_id = p_restaurant_id and p.active
      where p.id is null
    ) then
    raise exception 'INVALID_PRODUCT' using errcode = '23514';
  end if;

  -- Bloquear antes de consultar vendidos, borrar o insertar stock.
  perform public.bloquear_stock_items(p_restaurant_id, p_stock_date, p_items);

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
    order by (i.value->>'productoId')::uuid
    on conflict (restaurant_id, product_id, stock_date) do update
      set quantity = excluded.quantity
      where product_daily_stock.sold <= excluded.quantity;
  get diagnostics v_afectados = row_count;
  if v_afectados <> v_limitados then
    raise exception 'STOCK_BELOW_SOLD' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.guardar_stock_diario(uuid, date, jsonb, boolean) from public, anon;
grant execute on function public.guardar_stock_diario(uuid, date, jsonb, boolean) to authenticated;


commit;
