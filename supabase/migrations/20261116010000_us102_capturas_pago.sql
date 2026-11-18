-- US-102: captura privada; nunca constituye una confirmación automática.
begin;

alter table public.restaurants add column wallet_holder_name text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capturas-pago', 'capturas-pago', false, 409600, array['image/jpeg', 'image/webp']);
-- Sin políticas Storage para anon/authenticated. Acceso solo desde el servidor.

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_session_id uuid references public.table_sessions(id),
  order_id uuid references public.orders(id),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  idempotency_key uuid not null,
  wallet text not null check (wallet in ('YAPE', 'PLIN')),
  expected_amount numeric(12,2) not null check (expected_amount > 0),
  declared_amount numeric(12,2) not null check (declared_amount > 0),
  storage_path text not null unique,
  image_sha256 text not null check (image_sha256 ~ '^[a-f0-9]{64}$'),
  duplicate boolean not null default false,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'NOT_RECEIVED')),
  created_at timestamptz not null default now(),
  verified_by uuid references public.users(id),
  verified_at timestamptz,
  rejection_reason text,
  deleted_at timestamptz,
  check ((table_session_id is null) <> (order_id is null)),
  check ((status = 'PENDING') = (verified_by is null)),
  check ((verified_by is null) = (verified_at is null)),
  check ((status = 'NOT_RECEIVED' and rejection_reason is not null
    and char_length(btrim(rejection_reason)) between 5 and 120 and rejection_reason !~ '[[:cntrl:]]')
    or (status <> 'NOT_RECEIVED' and rejection_reason is null)),
  unique (restaurant_id, idempotency_key)
);
create index payment_proofs_pending_idx on public.payment_proofs(restaurant_id, created_at) where status = 'PENDING';
create index payment_proofs_hash_idx on public.payment_proofs(restaurant_id, image_sha256, created_at);
create unique index payment_proofs_confirmed_hash_idx on public.payment_proofs(restaurant_id, image_sha256) where status = 'CONFIRMED';
create index payment_proofs_cleanup_idx on public.payment_proofs(created_at) where deleted_at is null;
alter table public.payment_proofs enable row level security;
create policy payment_proofs_read_staff on public.payment_proofs for select to authenticated
using ((select private.has_role(restaurant_id, array['CASHIER','OWNER','ADMIN','WAITER'])));
revoke all on public.payment_proofs from anon, authenticated;
grant select on public.payment_proofs to authenticated;
grant all on public.payment_proofs to service_role;
alter publication supabase_realtime add table public.payment_proofs;

-- Relación diferida: pago y comprobante nacen juntos en la misma transacción.
alter table public.payments add column payment_proof_id uuid unique
  references public.payment_proofs(id) deferrable initially deferred;
alter table public.payments drop constraint payments_registrador_check;
alter table public.payments add constraint payments_registrador_check check (
  created_by is not null
  or (stripe_session_id is not null and method = 'CARD' and status = 'CONFIRMED')
  or (payment_proof_id is not null and method = 'YAPE' and stripe_session_id is null)
);
alter table public.payments add constraint payments_captura_check check (
  payment_proof_id is null or (method = 'YAPE' and created_by is null and stripe_session_id is null)
);

-- Evita confirmar una captura desde el RPC manual de US-023.
create function private.us102_proteger_pago_captura() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.payment_proof_id is not null and new.status is distinct from old.status then
    if not exists (select 1 from public.payment_proofs c
      where c.id = old.payment_proof_id and c.payment_id = old.id
        and c.status = case new.status when 'CONFIRMED' then 'CONFIRMED' when 'FAILED' then 'NOT_RECEIVED' else '' end
        and c.verified_by = new.verified_by and c.verified_at = new.verified_at) then
      raise exception 'USE_PROOF_VERIFICATION' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.us102_proteger_pago_captura() from public, anon, authenticated, service_role;
create trigger payments_us102_verificacion before update on public.payments
for each row execute function private.us102_proteger_pago_captura();

create function public.registrar_pago_captura(
  p_sesion_id uuid, p_pedido_id uuid, p_clave uuid, p_wallet text,
  p_monto numeric, p_storage_path text, p_sha256 text
) returns table(captura_id uuid, ruta_guardada text)
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_saldo numeric;
  v_id uuid := gen_random_uuid();
  v_pago uuid := gen_random_uuid();
  v_existente public.payment_proofs%rowtype;
  v_duplicada boolean;
begin
  if ((p_sesion_id is null) = (p_pedido_id is null)) or p_clave is null
    or p_wallet is null or p_wallet not in ('YAPE','PLIN')
    or p_monto is null or p_monto <= 0 or p_monto <> round(p_monto,2)
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_PAYMENT';
  end if;
  -- Mismo orden de bloqueo que los otros medios de pago.
  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions where id = p_sesion_id for update;
  else
    select restaurant_id into v_restaurant from public.orders where id = p_pedido_id and modality = 'TAKEAWAY' for update;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select * into v_existente from public.payment_proofs
    where restaurant_id = v_restaurant and idempotency_key = p_clave;
  if found then
    if v_existente.table_session_id is distinct from p_sesion_id or v_existente.order_id is distinct from p_pedido_id
      or v_existente.wallet <> p_wallet or v_existente.declared_amount <> p_monto or v_existente.image_sha256 <> p_sha256 then
      raise exception 'INVALID_PAYMENT';
    end if;
    return query select v_existente.id, v_existente.storage_path;
    return;
  end if;
  if not exists (select 1 from public.restaurants where id = v_restaurant and nullif(trim(wallet_holder_name),'') is not null) then
    raise exception 'WALLET_NOT_CONFIGURED';
  end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_restaurant::text || '/[a-f0-9-]{36}\.jpg$') then
    raise exception 'INVALID_FILE';
  end if;
  v_saldo := public.saldo_cuenta_online(p_sesion_id, p_pedido_id);
  if v_saldo is null or v_saldo <= 0 then raise exception 'NOTHING_TO_PAY'; end if;
  if p_monto > v_saldo then raise exception 'AMOUNT_EXCEEDS_BALANCE'; end if;
  -- Serializa la detección de duplicados incluso entre cuentas distintas.
  perform pg_advisory_xact_lock(hashtextextended(v_restaurant::text || p_sha256, 102));
  select exists(select 1 from public.payment_proofs where restaurant_id = v_restaurant
    and image_sha256 = p_sha256 and created_at >= now() - interval '24 hours') into v_duplicada;
  insert into public.payments(id,restaurant_id,table_session_id,order_id,method,status,amount,idempotency_key,created_by,payment_proof_id)
  values(v_pago,v_restaurant,p_sesion_id,p_pedido_id,'YAPE','PENDING',p_monto,p_clave,null,v_id);
  insert into public.payment_proofs(id,restaurant_id,table_session_id,order_id,payment_id,idempotency_key,
    wallet,expected_amount,declared_amount,storage_path,image_sha256,duplicate)
  values(v_id,v_restaurant,p_sesion_id,p_pedido_id,v_pago,p_clave,p_wallet,v_saldo,p_monto,p_storage_path,p_sha256,v_duplicada);
  return query select v_id, p_storage_path;
end;
$$;
revoke all on function public.registrar_pago_captura(uuid,uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.registrar_pago_captura(uuid,uuid,uuid,text,numeric,text,text) to service_role;

create function public.verificar_pago_captura(p_captura_id uuid,p_resultado text,p_monto_recibido numeric,p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_c public.payment_proofs%rowtype;
  v_pago public.payments%rowtype;
  v_monto numeric;
  v_saldo numeric;
  v_hora timestamptz := now();
begin
  select * into v_c from public.payment_proofs where id = p_captura_id;
  if not found then raise exception 'PROOF_NOT_FOUND'; end if;
  if auth.uid() is null or not private.has_role(v_c.restaurant_id,array['CASHIER','OWNER','ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_resultado is null or p_resultado not in ('COMPLETE','OTHER','NOT_RECEIVED') then raise exception 'INVALID_PAYMENT'; end if;
  if p_resultado = 'NOT_RECEIVED' and (p_motivo is null or char_length(btrim(p_motivo)) not between 5 and 120 or p_motivo ~ '[[:cntrl:]]') then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;
  if v_c.table_session_id is not null then
    perform 1 from public.table_sessions where id = v_c.table_session_id for update;
  else
    perform 1 from public.orders where id = v_c.order_id for update;
  end if;
  select * into v_pago from public.payments where id = v_c.payment_id for update;
  select * into v_c from public.payment_proofs where id = p_captura_id for update;
  if v_c.status <> 'PENDING' or v_pago.status <> 'PENDING' then raise exception 'ALREADY_VERIFIED'; end if;
  if p_resultado <> 'NOT_RECEIVED' then
    -- Mismo orden cuenta -> huella que el registro; protege también dos cuentas distintas.
    perform pg_advisory_xact_lock(hashtextextended(v_c.restaurant_id::text || v_c.image_sha256, 102));
    if exists (select 1 from public.payment_proofs where restaurant_id = v_c.restaurant_id
      and image_sha256 = v_c.image_sha256 and status = 'CONFIRMED' and id <> v_c.id) then
      raise exception 'PROOF_ALREADY_USED';
    end if;
    v_monto := case when p_resultado = 'COMPLETE' then v_c.declared_amount else p_monto_recibido end;
    if v_monto is null or v_monto <= 0 or v_monto <> round(v_monto,2) then raise exception 'INVALID_PAYMENT'; end if;
    v_saldo := public.saldo_cuenta_online(v_c.table_session_id,v_c.order_id);
    if v_saldo is null or v_saldo <= 0 then raise exception 'NOTHING_TO_PAY'; end if;
    if v_monto > v_saldo then raise exception 'AMOUNT_EXCEEDS_BALANCE'; end if;
  end if;
  update public.payment_proofs set status = case when p_resultado = 'NOT_RECEIVED' then 'NOT_RECEIVED' else 'CONFIRMED' end,
    rejection_reason = case when p_resultado = 'NOT_RECEIVED' then btrim(p_motivo) end,
    verified_by = auth.uid(), verified_at = v_hora where id = v_c.id;
  update public.payments set status = case when p_resultado = 'NOT_RECEIVED' then 'FAILED' else 'CONFIRMED' end,
    amount = coalesce(v_monto,amount), verified_by = auth.uid(), verified_at = v_hora,
    confirmed_at = case when p_resultado <> 'NOT_RECEIVED' then v_hora end where id = v_pago.id;
  -- Los triggers de US-085/094/097 y boletas siguen siendo los responsables.
  return v_pago.id;
end;
$$;
revoke all on function public.verificar_pago_captura(uuid,text,numeric,text) from public,anon;
grant execute on function public.verificar_pago_captura(uuid,text,numeric,text) to authenticated;
commit;
