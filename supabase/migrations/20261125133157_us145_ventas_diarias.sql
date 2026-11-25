-- US-145: ventas diarias consolidadas por restaurante, plato y día (hora de Lima).
-- Migración ADITIVA: una tabla y funciones nuevas. No cambia funciones ni políticas
-- existentes, así que se puede aplicar a la base compartida antes del merge.
-- La usa US-146 (sugerencia de stock) junto con product_daily_stock y demand_forecasts.

begin;

create table public.daily_product_sales (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null,
  sales_date date not null,                          -- día en hora de Lima
  units_ordered integer not null check (units_ordered >= 0),   -- sin cancelados ni pruebas
  initial_stock integer check (initial_stock >= 0),  -- «Stock del día»; null = sin límite
  sold_out boolean not null,
  incomplete boolean not null,
  incomplete_reason text check (incomplete_reason in ('AGOTADO', 'BLOQUEADO', 'LOCAL_CERRADO')),
  consolidated_at timestamptz not null default now(),
  -- Un día incompleto siempre dice por qué; uno completo no tiene motivo.
  constraint daily_product_sales_motivo_check check (incomplete = (incomplete_reason is not null)),
  -- Impide asociar ventas a un plato de otro restaurante (igual que demand_forecasts).
  constraint daily_product_sales_product_restaurant_fkey
    foreign key (product_id, restaurant_id) references public.products(id, restaurant_id) on delete cascade,
  constraint daily_product_sales_restaurant_product_date_key
    unique (restaurant_id, product_id, sales_date)
);

create index daily_product_sales_restaurant_date_idx
  on public.daily_product_sales (restaurant_id, sales_date);

alter table public.daily_product_sales enable row level security;

-- Solo dueño y admin del restaurante leen. Nadie escribe desde la app:
-- solo consolidar_ventas_diarias, con la cuenta de servicio.
create policy daily_product_sales_read_owner_admin on public.daily_product_sales
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

revoke all on public.daily_product_sales from anon, authenticated;
grant select on public.daily_product_sales to authenticated;

-- Regla de US-111 (src/features/dashboard/pedidos-de-prueba.ts): un pedido es de prueba
-- si customer_name o alguna observation empieza con uno de estos prefijos (respeta
-- mayúsculas). Una prueba unitaria compara esta lista con la de TypeScript.
create function private.prefijos_pedido_prueba()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['PRUEBA E2E', 'Prueba US-', 'Prueba local US-', 'Prueba Checkout snapshot US-']::text[];
$$;

revoke all on function private.prefijos_pedido_prueba() from public, anon, authenticated;

-- Recalcula los días [p_desde, p_hasta] de todos los restaurantes y devuelve cuántas
-- filas cambiaron. Solo días ya terminados (antes de hoy en Lima), máximo 62 días.
-- Repetirla no duplica ni toca filas cuyas cifras no cambiaron.
create function public.consolidar_ventas_diarias(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_patrones text[];
  v_cambios integer;
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta
     or p_hasta >= v_hoy or p_hasta - p_desde > 61 then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;

  v_inicio := p_desde::timestamp at time zone 'America/Lima';
  v_fin := (p_hasta + 1)::timestamp at time zone 'America/Lima';
  select array_agg(prefijo || '%') into v_patrones from unnest(private.prefijos_pedido_prueba()) as prefijo;

  with pedidos_reales as (
    -- Sin cancelados (incluye los vencidos de US-097) ni pedidos de prueba (US-111).
    select o.id, o.restaurant_id, (o.created_at at time zone 'America/Lima')::date as dia
    from public.orders o
    where o.created_at >= v_inicio and o.created_at < v_fin
      and o.status <> 'CANCELLED'
      and not coalesce(o.customer_name like any (v_patrones), false)
      and not exists (
        select 1 from public.order_items oi
        where oi.order_id = o.id and oi.observation like any (v_patrones)
      )
  ),
  ventas as (
    select p.restaurant_id, oi.product_id, p.dia, sum(oi.quantity)::integer as unidades
    from pedidos_reales p
    join public.order_items oi on oi.order_id = p.id
    group by p.restaurant_id, oi.product_id, p.dia
  ),
  abiertos as (
    -- Un día sin ningún pedido real se considera local cerrado.
    select distinct restaurant_id, dia from pedidos_reales
  ),
  stock as (
    select s.restaurant_id, s.product_id, s.stock_date as dia, s.quantity, s.sold
    from public.product_daily_stock s
    where s.stock_date between p_desde and p_hasta
  ),
  candidatos as (
    select restaurant_id, product_id, dia from ventas
    union
    select restaurant_id, product_id, dia from stock
    union
    -- Platos activos que ya existían ese día (un día sin pedidos también es dato).
    select pr.restaurant_id, pr.id, d.dia::date
    from public.products pr
    cross join generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
    where pr.active and pr.created_at < ((d.dia::date + 1)::timestamp at time zone 'America/Lima')
  ),
  calculo as (
    select
      c.restaurant_id, c.product_id, c.dia,
      coalesce(v.unidades, 0) as unidades,
      s.quantity as stock_inicial,
      coalesce(s.quantity > 0 and s.sold >= s.quantity, false) as agotado,
      case
        when a.restaurant_id is null then 'LOCAL_CERRADO'
        when s.quantity = 0 then 'BLOQUEADO'
        when s.quantity > 0 and s.sold >= s.quantity then 'AGOTADO'
      end as motivo
    from candidatos c
    left join ventas v using (restaurant_id, product_id, dia)
    left join stock s using (restaurant_id, product_id, dia)
    left join abiertos a using (restaurant_id, dia)
  )
  insert into public.daily_product_sales as t (
    restaurant_id, product_id, sales_date, units_ordered, initial_stock,
    sold_out, incomplete, incomplete_reason
  )
  select restaurant_id, product_id, dia, unidades, stock_inicial, agotado, motivo is not null, motivo
  from calculo
  on conflict (restaurant_id, product_id, sales_date) do update set
    units_ordered = excluded.units_ordered,
    initial_stock = excluded.initial_stock,
    sold_out = excluded.sold_out,
    incomplete = excluded.incomplete,
    incomplete_reason = excluded.incomplete_reason,
    consolidated_at = now()
  where (t.units_ordered, t.initial_stock, t.sold_out, t.incomplete, t.incomplete_reason)
    is distinct from
    (excluded.units_ordered, excluded.initial_stock, excluded.sold_out, excluded.incomplete, excluded.incomplete_reason);

  get diagnostics v_cambios = row_count;
  return v_cambios;
end;
$$;

revoke all on function public.consolidar_ventas_diarias(date, date) from public, anon, authenticated;
grant execute on function public.consolidar_ventas_diarias(date, date) to service_role;

commit;
