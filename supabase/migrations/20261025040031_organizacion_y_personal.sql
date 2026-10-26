-- US-034: organización y personal
-- Tablas: restaurants, branches, users, roles, staff_memberships

-- Restaurante (cliente del SaaS)
create table public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Local o sucursal de un restaurante
create table public.branches (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  address        text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (restaurant_id, name),
  -- permite que otras tablas exijan "este local es de ESTE restaurante"
  unique (id, restaurant_id)
);

-- Perfil del personal. El login y la contraseña los maneja Supabase Auth (auth.users)
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  created_at  timestamptz not null default now()
);

-- Catálogo fijo de roles
create table public.roles (
  id    smallint primary key generated always as identity,
  code  text not null unique
        check (code in ('OWNER', 'ADMIN', 'WAITER', 'KITCHEN', 'CASHIER')),
  name  text not null
);

insert into public.roles (code, name) values
  ('OWNER',   'Dueño'),
  ('ADMIN',   'Administrador'),
  ('WAITER',  'Mesero'),
  ('KITCHEN', 'Cocina'),
  ('CASHIER', 'Cajero');

-- Qué rol tiene cada persona en qué restaurante (y opcionalmente en qué local)
create table public.staff_memberships (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  branch_id      uuid,  -- vacío = todos los locales del restaurante
  role_id        smallint not null references public.roles(id),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade,
  unique nulls not distinct (user_id, restaurant_id, branch_id, role_id)
);

-- Seguridad: RLS activado desde el inicio. Las políticas se crean en US-028;
-- hasta entonces nadie desde el navegador puede leer ni escribir estas tablas.
alter table public.restaurants       enable row level security;
alter table public.branches          enable row level security;
alter table public.users             enable row level security;
alter table public.roles             enable row level security;
alter table public.staff_memberships enable row level security;