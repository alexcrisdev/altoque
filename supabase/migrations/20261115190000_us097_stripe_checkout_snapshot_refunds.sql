-- US-097: vincula cada Checkout de Stripe al saldo y a los pedidos incluidos
-- cuando se creó. Conserva el estado de reembolsos con reintentos idempotentes.
begin;

create table public.stripe_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_session_id uuid references public.table_sessions(id),
  order_id uuid references public.orders(id),
  order_ids uuid[] not null,
  amount numeric(12,2) not null check (amount > 0),
  checkout_session_id text unique,
  status text not null default 'CREATING'
    check (status in ('CREATING', 'OPEN', 'PAID', 'EXPIRED', 'REFUNDING', 'REFUND_FAILED', 'REFUNDED')),
  expires_at timestamptz not null,
  refund_attempt integer not null default 0 check (refund_attempt >= 0),
  stripe_refund_id text,
  refund_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((table_session_id is null) <> (order_id is null)),
  check (cardinality(order_ids) > 0)
);

create index stripe_checkout_activos_mesa_idx
  on public.stripe_checkout_attempts(table_session_id, expires_at)
  where table_session_id is not null and status in ('CREATING', 'OPEN');
create index stripe_checkout_activos_pedido_idx
  on public.stripe_checkout_attempts(order_id, expires_at)
  where order_id is not null and status in ('CREATING', 'OPEN');
alter table public.stripe_checkout_attempts enable row level security;
revoke all on public.stripe_checkout_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_checkout_attempts to service_role;

-- Captura un snapshot bajo el bloqueo de la cuenta. Los metadatos del navegador
-- nunca deciden la cuenta ni el importe enviados a Stripe.
create or replace function public.iniciar_checkout_stripe(p_sesion_id uuid, p_pedido_id uuid)
returns table (checkout_id uuid, restaurant_id uuid, account_type text, account_id uuid,
  amount numeric, order_ids uuid[], expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_restaurant uuid;
  v_amount numeric;
  v_gross numeric;
  v_ids uuid[];
  v_checkout uuid;
  v_expira timestamptz := clock_timestamp() + interval '31 minutes';
begin
  if (p_sesion_id is null) = (p_pedido_id is null) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Primero expira en orden global de cuentas y luego se bloquea la cuenta
  -- solicitada; evita ciclos de bloqueo entre dos Checkouts simultáneos.
  perform public.vencer_pedidos_sin_pago(
    coalesce((select s.restaurant_id from public.table_sessions s where s.id = p_sesion_id),
      (select o.restaurant_id from public.orders o where o.id = p_pedido_id))
  );

  if p_sesion_id is not null then
    select s.restaurant_id into v_restaurant from public.table_sessions s
      where s.id = p_sesion_id and s.closed_at is null for update;
    if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
    select coalesce(array_agg(o.id order by o.id), '{}'::uuid[]),
      coalesce(sum(oi.unit_price * oi.quantity), 0)
      into v_ids, v_gross
      from public.orders o join public.order_items oi on oi.order_id = o.id
      where o.table_session_id = p_sesion_id and o.restaurant_id = v_restaurant
        and o.status <> 'CANCELLED';
  else
    select o.restaurant_id into v_restaurant from public.orders o
      where o.id = p_pedido_id and o.modality = 'TAKEAWAY' and o.status <> 'CANCELLED'
      for update;
    if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
    select coalesce(array_agg(o.id), '{}'::uuid[]),
      coalesce(sum(oi.unit_price * oi.quantity), 0)
      into v_ids, v_gross
      from public.orders o join public.order_items oi on oi.order_id = o.id
      where o.id = p_pedido_id and o.restaurant_id = v_restaurant and o.status <> 'CANCELLED';
  end if;

  if p_sesion_id is not null then
    v_amount := private.saldo_pendiente_sesion(p_sesion_id);
  else
    v_amount := private.saldo_pendiente_pedido(p_pedido_id);
  end if;
  if v_amount <= 0 or cardinality(v_ids) = 0 then raise exception 'NOTHING_TO_PAY' using errcode = '22023'; end if;

  insert into public.stripe_checkout_attempts (
    restaurant_id, table_session_id, order_id, order_ids, amount, expires_at
  ) values (v_restaurant, p_sesion_id, p_pedido_id, v_ids, v_amount, v_expira)
  returning id into v_checkout;
  return query select v_checkout, v_restaurant,
    case when p_sesion_id is not null then 'MESA' else 'PARA_LLEVAR' end,
    coalesce(p_sesion_id, p_pedido_id), v_amount, v_ids, v_expira;
end;
$$;
revoke all on function public.iniciar_checkout_stripe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.iniciar_checkout_stripe(uuid, uuid) to service_role;

create or replace function public.vincular_checkout_stripe(p_checkout_id uuid, p_session_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.stripe_checkout_attempts set checkout_session_id = p_session_id,
    status = 'OPEN', updated_at = clock_timestamp()
    where id = p_checkout_id and status = 'CREATING'
      and p_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$';
  return found;
end;
$$;
revoke all on function public.vincular_checkout_stripe(uuid, text) from public, anon, authenticated;
grant execute on function public.vincular_checkout_stripe(uuid, text) to service_role;

create or replace function public.cancelar_checkout_stripe(p_checkout_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.stripe_checkout_attempts set status = 'EXPIRED', updated_at = clock_timestamp()
  where id = p_checkout_id and status = 'CREATING';
$$;
revoke all on function public.cancelar_checkout_stripe(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_checkout_stripe(uuid) to service_role;

create or replace function public.obtener_checkout_stripe(p_session_id text)
returns table (id uuid, restaurant_id uuid, table_session_id uuid, order_id uuid,
  order_ids uuid[], amount numeric, status text, expires_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select c.id, c.restaurant_id, c.table_session_id, c.order_id, c.order_ids,
    c.amount, c.status, c.expires_at
  from public.stripe_checkout_attempts c where c.checkout_session_id = p_session_id;
$$;
revoke all on function public.obtener_checkout_stripe(text) from public, anon, authenticated;
grant execute on function public.obtener_checkout_stripe(text) to service_role;

create or replace function public.preparar_reembolso_checkout(p_session_id text)
returns table (checkout_id uuid, intento integer, ya_reembolsado boolean)
language plpgsql security definer set search_path = '' as $$
declare v_checkout public.stripe_checkout_attempts%rowtype;
begin
  select * into v_checkout from public.stripe_checkout_attempts
    where checkout_session_id = p_session_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_checkout.status = 'REFUNDED' then
    return query select v_checkout.id, v_checkout.refund_attempt, true; return;
  end if;
  if v_checkout.status not in ('REFUNDING') then
    update public.stripe_checkout_attempts set status = 'REFUNDING',
      refund_attempt = refund_attempt + 1, refund_error = null,
      stripe_refund_id = null,
      updated_at = clock_timestamp()
      where id = v_checkout.id returning * into v_checkout;
  end if;
  return query select v_checkout.id, v_checkout.refund_attempt, false;
end;
$$;
revoke all on function public.preparar_reembolso_checkout(text) from public, anon, authenticated;
grant execute on function public.preparar_reembolso_checkout(text) to service_role;

create or replace function public.finalizar_reembolso_checkout(
  p_session_id text, p_refund_id text, p_error text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.stripe_checkout_attempts set
    status = case when p_error like 'PENDING%' then 'REFUNDING'
      when p_error like 'FAILED:%' or p_refund_id is null then 'REFUND_FAILED' else 'REFUNDED' end,
    stripe_refund_id = coalesce(p_refund_id, stripe_refund_id), refund_error = left(p_error, 100),
    updated_at = clock_timestamp()
    where checkout_session_id = p_session_id and status = 'REFUNDING';
  if not found and not exists (select 1 from public.stripe_checkout_attempts
      where checkout_session_id = p_session_id and status = 'REFUNDED'
        and stripe_refund_id = p_refund_id) then
    raise exception 'CHECKOUT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.finalizar_reembolso_checkout(text, text, text) from public, anon, authenticated;
grant execute on function public.finalizar_reembolso_checkout(text, text, text) to service_role;

create or replace function public.actualizar_estado_reembolso_checkout(
  p_checkout_id uuid, p_intento integer, p_refund_id text, p_status text, p_error text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
    raise exception 'INVALID_REFUND_STATUS' using errcode = '22023';
  end if;
  update public.stripe_checkout_attempts set
    status = case when p_status = 'succeeded' then 'REFUNDED'
      when p_status in ('failed', 'canceled') then 'REFUND_FAILED' else 'REFUNDING' end,
    stripe_refund_id = p_refund_id, refund_error = left(p_error, 100),
    updated_at = clock_timestamp()
    where id = p_checkout_id and refund_attempt = p_intento
      and (stripe_refund_id = p_refund_id or stripe_refund_id is null)
      and status in ('REFUNDING', 'REFUND_FAILED', 'REFUNDED');
  if not found and not exists (select 1 from public.stripe_checkout_attempts where id = p_checkout_id) then
    raise exception 'CHECKOUT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.actualizar_estado_reembolso_checkout(uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.actualizar_estado_reembolso_checkout(uuid, integer, text, text, text)
  to service_role;

create or replace function public.registrar_pago_stripe(
  p_stripe_session_id text, p_payment_intent text, p_sesion_id uuid,
  p_pedido_id uuid, p_monto numeric
) returns table (pago_id uuid, duplicado boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_checkout public.stripe_checkout_attempts%rowtype;
  v_restaurant uuid;
  v_saldo numeric;
  v_existente public.payments%rowtype;
  v_invalidos integer;
  v_checkout_encontrado boolean;
begin
  if p_stripe_session_id is null or p_payment_intent is null
    or ((p_sesion_id is null) = (p_pedido_id is null))
    or p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;
  select * into v_existente from public.payments where stripe_session_id = p_stripe_session_id;
  if found then return query select v_existente.id, true; return; end if;

  select * into v_checkout from public.stripe_checkout_attempts
    where checkout_session_id = p_stripe_session_id for update;
  v_checkout_encontrado := found;
  if v_checkout_encontrado then
    select * into v_existente from public.payments where stripe_session_id = p_stripe_session_id;
    if found then return query select v_existente.id, true; return; end if;
  end if;
  if not v_checkout_encontrado or v_checkout.status <> 'OPEN' or v_checkout.expires_at <= clock_timestamp()
    or v_checkout.amount <> p_monto or v_checkout.table_session_id is distinct from p_sesion_id
    or v_checkout.order_id is distinct from p_pedido_id then
    raise exception 'CHECKOUT_STALE' using errcode = '22023';
  end if;

  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions
      where id = p_sesion_id and closed_at is null for update;
  else
    select restaurant_id into v_restaurant from public.orders
      where id = p_pedido_id and modality = 'TAKEAWAY' and status <> 'CANCELLED' for update;
  end if;
  if v_restaurant is null or v_restaurant <> v_checkout.restaurant_id then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Revalida bajo el bloqueo de la cuenta: otro webhook idéntico pudo haber
  -- confirmado el Checkout mientras este esperaba el mismo bloqueo.
  select * into v_existente from public.payments where stripe_session_id = p_stripe_session_id;
  if found then return query select v_existente.id, true; return; end if;
  if exists (select 1 from public.payments p where p.status = 'CONFIRMED'
      and p.confirmed_at > v_checkout.created_at
      and (p.table_session_id = p_sesion_id or p.order_id = p_pedido_id)) then
    raise exception 'CHECKOUT_STALE' using errcode = '22023';
  end if;
  select count(*) into v_invalidos from public.orders o
    where o.id = any(v_checkout.order_ids) and o.status = 'CANCELLED';
  if v_invalidos > 0 or cardinality(v_checkout.order_ids) = 0 then
    raise exception 'CHECKOUT_STALE' using errcode = '22023';
  end if;

  v_saldo := case when p_sesion_id is not null
    then private.saldo_pendiente_sesion(p_sesion_id)
    else private.saldo_pendiente_pedido(p_pedido_id) end;
  if p_monto > v_saldo then raise exception 'CHECKOUT_STALE' using errcode = '22023'; end if;

  insert into public.payments (restaurant_id, table_session_id, order_id, method,
    status, amount, reference, stripe_session_id, idempotency_key, created_by, confirmed_at)
  values (v_restaurant, p_sesion_id, p_pedido_id, 'CARD', 'CONFIRMED', p_monto,
    p_payment_intent, p_stripe_session_id, gen_random_uuid(), null, clock_timestamp())
  returning * into v_existente;
  update public.stripe_checkout_attempts set status = 'PAID', updated_at = clock_timestamp()
    where id = v_checkout.id;
  return query select v_existente.id, false;
end;
$$;
revoke all on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric) to service_role;

-- Un Checkout de mesa solo libera los pedidos de su snapshot. Así un pedido
-- agregado después del Checkout queda pendiente de su propio pago.
create or replace function private.us094_iniciar_preparacion_al_pagar_sesion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
  v_order_ids uuid[];
begin
  if tg_op = 'UPDATE' and old.status = 'CONFIRMED' then return new; end if;
  perform 1 from public.table_sessions where id = new.table_session_id
    and restaurant_id = new.restaurant_id for update;
  if not found then return new; end if;

  if new.stripe_session_id is not null then
    select c.order_ids into v_order_ids from public.stripe_checkout_attempts c
      where c.checkout_session_id = new.stripe_session_id;
    if v_order_ids is not null then
      for v_pedido in select * from public.orders where id = any(v_order_ids)
        and table_session_id = new.table_session_id and restaurant_id = new.restaurant_id
        and status = 'PENDING' order by id for update
      loop
        update public.orders set status = 'IN_PROGRESS' where id = v_pedido.id;
        insert into public.order_status_history(order_id, restaurant_id, from_status,
          to_status, changed_by, reason, created_at)
        values (v_pedido.id, v_pedido.restaurant_id, 'PENDING', 'IN_PROGRESS', null,
          'US-097: pago Checkout', clock_timestamp());
      end loop;
      return new;
    end if;
  end if;

  if private.saldo_pendiente_sesion(new.table_session_id) <> 0 then return new; end if;
  for v_pedido in select * from public.orders where table_session_id = new.table_session_id
    and restaurant_id = new.restaurant_id and status = 'PENDING' order by id for update
  loop
    update public.orders set status = 'IN_PROGRESS' where id = v_pedido.id;
    insert into public.order_status_history(order_id, restaurant_id, from_status,
      to_status, changed_by, reason, created_at)
    values (v_pedido.id, v_pedido.restaurant_id, 'PENDING', 'IN_PROGRESS',
      coalesce(new.verified_by, new.created_by), 'US-094: pago confirmado', clock_timestamp());
  end loop;
  return new;
end;
$$;
revoke all on function private.us094_iniciar_preparacion_al_pagar_sesion()
  from public, anon, authenticated, service_role;

-- No se vence el snapshot protegido por un Checkout activo; los pedidos nuevos
-- de la misma mesa no quedan cubiertos por ese Checkout y siguen venciendo normal.
create or replace function public.vencer_pedidos_sin_pago(p_restaurante uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_candidato record; v_pedido public.orders%rowtype; v_cancelados integer := 0;
begin
  if p_restaurante is null then raise exception 'RESTAURANT_REQUIRED' using errcode = '22023'; end if;
  for v_candidato in
    select o.id, o.table_session_id from public.orders o
    where o.restaurant_id = p_restaurante and o.source = 'QR' and o.status = 'PENDING'
      and o.created_at <= clock_timestamp() - interval '15 minutes'
    order by coalesce(o.table_session_id, o.id), o.id
  loop
    if v_candidato.table_session_id is not null then
      perform 1 from public.table_sessions s where s.id = v_candidato.table_session_id
        and s.restaurant_id = p_restaurante for update;
    end if;
    select * into v_pedido from public.orders o where o.id = v_candidato.id
      and o.restaurant_id = p_restaurante and o.source = 'QR' and o.status = 'PENDING'
      and o.created_at <= clock_timestamp() - interval '15 minutes' for update;
    if not found then continue; end if;
    if exists (select 1 from public.stripe_checkout_attempts c where c.status in ('CREATING', 'OPEN')
      and c.expires_at > clock_timestamp() and v_pedido.id = any(c.order_ids)) then continue; end if;
    if exists (select 1 from public.payments p where p.restaurant_id = p_restaurante
      and p.status = 'PENDING' and (p.order_id = v_pedido.id
        or (v_pedido.table_session_id is not null and p.table_session_id = v_pedido.table_session_id))) then continue; end if;
    update public.orders set status = 'CANCELLED' where id = v_pedido.id
      and restaurant_id = p_restaurante and status = 'PENDING';
    if found then
      insert into public.order_status_history(order_id, restaurant_id, from_status, to_status, changed_by, reason)
        values (v_pedido.id, p_restaurante, 'PENDING', 'CANCELLED', null, 'Vencido sin pago');
      v_cancelados := v_cancelados + 1;
    end if;
  end loop;
  return v_cancelados;
end;
$$;
revoke all on function public.vencer_pedidos_sin_pago(uuid) from public, anon, authenticated;
grant execute on function public.vencer_pedidos_sin_pago(uuid) to service_role;

commit;
