-- US-034: carta digital
-- Tablas: categories, products
-- La carta es por restaurante (no por local); cada local la ajusta con "available".

-- Categoría de la carta (Ceviches, Bebidas...)
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  sort_order     integer not null default 0 check (sort_order >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (restaurant_id, name),
  -- permite que el producto exija "categoría de ESTE restaurante"
  unique (id, restaurant_id)
);

-- Producto de la carta
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null,
  category_id    uuid not null,
  name           text not null check (length(trim(name)) > 0),
  description    text,
  price          numeric(10,2) not null check (price > 0),
  image_url      text,
  available      boolean not null default true,  -- hoy se acabó
  active         boolean not null default true,  -- ya no se vende
  created_at     timestamptz not null default now(),
  -- la categoría tiene que ser de ese mismo restaurante
  foreign key (category_id, restaurant_id)
    references public.categories(id, restaurant_id) on delete cascade,
  unique (restaurant_id, name)
);

-- Acelera "productos de esta categoría" (la carta se arma así)
create index products_category_idx on public.products (category_id);

alter table public.categories enable row level security;
alter table public.products   enable row level security;