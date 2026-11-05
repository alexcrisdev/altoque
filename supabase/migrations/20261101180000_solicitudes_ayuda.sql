-- US-013: solicitudes de ayuda desde un QR validado en el servidor.
-- Alexander debe revisar y aplicar esta migración; no se aplica desde la app.
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid not null,
  qr_code_id uuid not null references public.qr_codes(id),
  dining_table_id uuid,
  table_session_id uuid references public.table_sessions(id),
  status text not null default 'OPEN' check (status in ('OPEN', 'ATTENDED')),
  created_at timestamptz not null default now(),
  attended_by uuid references public.users(id),
  attended_at timestamptz,
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id),
  foreign key (dining_table_id, branch_id) references public.dining_tables(id, branch_id),
  check ((status = 'ATTENDED') = (attended_at is not null)),
  check ((status = 'ATTENDED') = (attended_by is not null)),
  check ((dining_table_id is null) = (table_session_id is null))
);

create unique index help_requests_one_open_per_qr
  on public.help_requests (qr_code_id) where status = 'OPEN';
create index help_requests_restaurant_open_created
  on public.help_requests (restaurant_id, created_at) where status = 'OPEN';

alter table public.help_requests enable row level security;
revoke all on table public.help_requests from public, anon, authenticated;
grant select on table public.help_requests to authenticated;

create policy help_requests_read_staff on public.help_requests
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['WAITER', 'OWNER', 'ADMIN'])));

-- Solo el servidor puede solicitar ayuda; el cliente no elige mesa/restaurante.
create function public.solicitar_ayuda(p_qr_code_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.qr_codes%rowtype;
  v_session uuid;
  v_request uuid;
begin
  -- Serializar por QR evita duplicados incluso con solicitudes simultáneas.
  select q.* into v_qr
    from public.qr_codes q
    join public.branches b on b.id = q.branch_id and b.restaurant_id = q.restaurant_id
    join public.restaurants r on r.id = q.restaurant_id
    left join public.dining_tables dt on dt.id = q.dining_table_id and dt.branch_id = q.branch_id
    where q.id = p_qr_code_id and q.active and q.revoked_at is null and b.active and r.active
      and (q.purpose = 'TAKEAWAY' or (q.purpose = 'DINE_IN' and dt.active))
    for update of q;

  if not found then
    raise exception 'QR_UNAVAILABLE' using errcode = '23514';
  end if;

  if v_qr.purpose = 'DINE_IN' then
    select s.id into v_session from public.table_sessions s
      where s.dining_table_id = v_qr.dining_table_id
        and s.restaurant_id = v_qr.restaurant_id and s.branch_id = v_qr.branch_id
        and s.closed_at is null
      for share;
    if not found then
      raise exception 'TABLE_NOT_OPEN' using errcode = '23514';
    end if;
  end if;

  select h.id into v_request from public.help_requests h
    where h.qr_code_id = v_qr.id and h.status = 'OPEN'
    for update;
  if found then return v_request; end if;

  insert into public.help_requests
    (restaurant_id, branch_id, qr_code_id, dining_table_id, table_session_id)
    values (v_qr.restaurant_id, v_qr.branch_id, v_qr.id, v_qr.dining_table_id, v_session)
    returning id into v_request;
  return v_request;
end;
$$;

revoke all on function public.solicitar_ayuda(uuid) from public, anon, authenticated;
grant execute on function public.solicitar_ayuda(uuid) to service_role;

-- El mesero usa su propia sesión; la función comprueba el restaurante y el rol.
create function public.atender_solicitud_ayuda(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.help_requests%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select h.* into v_request from public.help_requests h
    where h.id = p_solicitud_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_role(v_request.restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_request.status = 'ATTENDED' then
    raise exception 'ALREADY_ATTENDED' using errcode = '22023';
  end if;

  update public.help_requests
    set status = 'ATTENDED', attended_by = v_user, attended_at = now()
    where id = v_request.id;
end;
$$;

revoke all on function public.atender_solicitud_ayuda(uuid) from public, anon, authenticated;
grant execute on function public.atender_solicitud_ayuda(uuid) to authenticated;
