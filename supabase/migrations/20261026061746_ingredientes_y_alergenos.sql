-- US-005: información alimentaria registrada por el restaurante.

alter table public.products
  add column ingredients text,
  add column allergens text[] not null default '{}',
  add constraint products_ingredients_not_blank
    check (
      ingredients is null
      or length(trim(ingredients)) > 0
    ),
  add constraint products_allergens_limit
    check (cardinality(allergens) <= 14);

comment on column public.products.ingredients is
  'Ingredientes registrados por el restaurante. NULL si no se informaron.';

comment on column public.products.allergens is
  'Advertencias registradas por el restaurante. Una lista vacía no garantiza ausencia de alérgenos.';