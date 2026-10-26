-- US-036: sesiones de mesa
create table public.table_sessions (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null,
  branch_id        uuid not null,
  dining_table_id  uuid not null,
  opened_at        timestamptz not null default now(),
  opened_by        uuid not null references public.users(id),
  closed_at        timestamptz,
  closed_by        uuid references public.users(id),
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade,
  foreign key (dining_table_id, branch_id)
    references public.dining_tables(id, branch_id) on delete cascade,
  check (
    (closed_at is null and closed_by is null) or
    (closed_at is not null and closed_by is not null)
  ),
  check (closed_at is null or closed_at >= opened_at)
);

-- Una mesa no puede tener más de una sesión abierta al mismo tiempo.
create unique index table_sessions_one_open_per_table
  on public.table_sessions (dining_table_id)
  where closed_at is null;

create index table_sessions_restaurant_opened_at
  on public.table_sessions (restaurant_id, opened_at);

-- Protege invariantes incluso si un UPDATE intenta cambiar otras columnas junto
-- con el cierre. También valida el estado de la mesa al crear la sesión.
create or replace function private.guard_table_session_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table_active boolean;
begin
  if tg_op = 'INSERT' then
    select dt.active
      into v_table_active
      from public.dining_tables as dt
      where dt.id = new.dining_table_id
        and dt.branch_id = new.branch_id
      for share;

    if not found or v_table_active is distinct from true then
      raise exception 'No se pueden abrir sesiones para mesas inactivas o inexistentes'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if old.closed_at is not null then
    raise exception 'Una sesión cerrada no se puede modificar'
      using errcode = '23514';
  end if;

  if new.id is distinct from old.id
    or new.restaurant_id is distinct from old.restaurant_id
    or new.branch_id is distinct from old.branch_id
    or new.dining_table_id is distinct from old.dining_table_id
    or new.opened_at is distinct from old.opened_at
    or new.opened_by is distinct from old.opened_by then
    raise exception 'Al cerrar una sesión no se pueden cambiar sus datos de apertura'
      using errcode = '23514';
  end if;

  if new.closed_at is null or new.closed_by is null then
    raise exception 'La sesión solo puede actualizarse para cerrarla'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger table_sessions_guard_changes
  before insert or update on public.table_sessions
  for each row execute function private.guard_table_session_changes();

revoke all on function private.guard_table_session_changes() from public, anon, authenticated;

alter table public.table_sessions enable row level security;

create policy table_sessions_read_member on public.table_sessions
  for select to authenticated
  using ((select private.is_member(restaurant_id)));

create policy table_sessions_insert_staff on public.table_sessions
  for insert to authenticated
  with check (
    (select private.has_role(restaurant_id, array['WAITER', 'OWNER', 'ADMIN']))
    and opened_by = (select auth.uid())
    and closed_at is null
    and closed_by is null
  );

create policy table_sessions_close_staff on public.table_sessions
  for update to authenticated
  using (
    closed_at is null
    and (select private.has_role(restaurant_id, array['WAITER', 'OWNER', 'ADMIN']))
  )
  with check (
    closed_at is not null
    and closed_by = (select auth.uid())
    and (select private.has_role(restaurant_id, array['WAITER', 'OWNER', 'ADMIN']))
  );

-- No se crea política de DELETE: las sesiones se conservan como historial.
