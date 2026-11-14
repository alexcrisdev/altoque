-- US-090: predicciones diarias de demanda por producto y restaurante.
-- La carga se realiza exclusivamente con la cuenta de servicio.

begin;

create table public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id) on delete cascade,

  product_id uuid not null,

  forecast_date date not null,

  predicted_quantity integer not null
    check (predicted_quantity >= 0),

  model text not null
    check (
      model = btrim(model)
      and length(model) between 1 and 120
    ),

  created_at timestamptz not null default now(),

  -- Impide asociar la predicción a un producto de otro restaurante.
  constraint demand_forecasts_product_restaurant_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete cascade,

  constraint demand_forecasts_restaurant_product_date_model_key
    unique (restaurant_id, product_id, forecast_date, model)
);

create index demand_forecasts_restaurant_date_idx
  on public.demand_forecasts (
    restaurant_id,
    forecast_date,
    created_at desc
  );

alter table public.demand_forecasts
  enable row level security;

create policy demand_forecasts_read_owner_admin
  on public.demand_forecasts
  for select
  to authenticated
  using (
    (
      select private.has_role(
        restaurant_id,
        array['OWNER', 'ADMIN']::text[]
      )
    )
  );

-- El personal solo puede leer mediante la política anterior.
revoke all on table public.demand_forecasts
  from public, anon, authenticated;

grant select on table public.demand_forecasts
  to authenticated;

-- La cuenta de servicio carga predicciones y permite limpiar fixtures.
grant select, insert, update, delete
  on table public.demand_forecasts
  to service_role;

commit;