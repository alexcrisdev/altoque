-- US-034: mesas y códigos QR
-- Tablas: dining_tables, qr_codes

-- Mesa de un local
create table public.dining_tables (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null,
  branch_id      uuid not null,
  number         integer not null check (number > 0),
  capacity       smallint check (capacity > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  -- el local tiene que ser de ese mismo restaurante
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade,
  unique (branch_id, number),
  -- permite que el QR exija "mesa de ESTE local"
  unique (id, branch_id)
);

-- Código QR: de mesa (DINE_IN) o de mostrador (TAKEAWAY)
create table public.qr_codes (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null,
  branch_id        uuid not null,
  dining_table_id  uuid,  -- vacío = QR de mostrador
  purpose          text not null check (purpose in ('DINE_IN', 'TAKEAWAY')),
  -- solo la huella SHA-256 del token (64 caracteres hex), nunca el token
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade,
  -- la mesa tiene que ser de ese mismo local
  foreign key (dining_table_id, branch_id)
    references public.dining_tables(id, branch_id) on delete cascade,
  -- DINE_IN lleva mesa; TAKEAWAY no
  check (
    (purpose = 'DINE_IN'  and dining_table_id is not null) or
    (purpose = 'TAKEAWAY' and dining_table_id is null)
  ),
  -- activo = sin fecha de anulación; anulado = con fecha
  check (
    (active and revoked_at is null) or
    (not active and revoked_at is not null)
  )
);

-- Un solo QR activo por mesa
create unique index qr_codes_one_active_per_table
  on public.qr_codes (dining_table_id)
  where active and dining_table_id is not null;

-- Un solo QR de mostrador activo por local
create unique index qr_codes_one_active_takeaway_per_branch
  on public.qr_codes (branch_id)
  where active and purpose = 'TAKEAWAY';

alter table public.dining_tables enable row level security;
alter table public.qr_codes      enable row level security;