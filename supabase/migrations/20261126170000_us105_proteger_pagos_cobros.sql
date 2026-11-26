-- US-105: proteger pedidos pagados y cobros (integra US-107, US-109 y US-110) y número
-- de pedido del día. Cada función parte de su última definición:
--   private.us094_iniciar_preparacion_al_pagar_sesion .. 20261115190000_us097_stripe_checkout_snapshot_refunds
--   public.vencer_pedidos_sin_pago ..................... 20261115190000_us097_stripe_checkout_snapshot_refunds
--   public.cambiar_estado_pedido ....................... 20261125045434_us106_segregar_roles_por_panel
--   public.verificar_pago .............................. 20261125045434_us106_segregar_roles_por_panel
--   public.registrar_pago_captura ...................... 20261116010000_us102_capturas_pago
-- "create or replace" conserva los permisos (grant/revoke) que ya tenía cada función.

begin;

-- =====================================================================================
-- 1) Qué pedidos están pagados
-- =====================================================================================

-- Pagos ligados a pedidos concretos de una mesa. Hoy: el Checkout de Stripe cubre
-- exactamente los pedidos de su snapshot (US-097).
-- US-150: cuando caja cobre "el pedido N.º X", agrega aquí (union all) esos pagos con su
-- pedido destino; el reparto de abajo no necesita cambiar.
create function private.us105_pagos_ligados_sesion(p_sesion_id uuid)
returns table (pago_id uuid, pedido_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, unnest(c.order_ids)
    from public.payments p
    join public.stripe_checkout_attempts c on c.checkout_session_id = p.stripe_session_id
    where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED';
$$;

-- Pedidos de una mesa cubiertos por pagos confirmados: primero los ligados a un pedido;
-- el resto de lo pagado (pago general de la mesa) se reparte del pedido más antiguo al
-- más nuevo. Un pedido queda cubierto si lo acumulado hasta él no supera lo disponible.
create function private.us105_pedidos_cubiertos_sesion(p_sesion_id uuid)
returns table (pedido_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with pedidos as (
    select o.id, o.created_at, o.order_number, coalesce(sum(oi.unit_price * oi.quantity), 0) as total
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      where o.table_session_id = p_sesion_id and o.status <> 'CANCELLED'
      group by o.id
  ),
  ligados as (
    select distinct l.pedido_id from private.us105_pagos_ligados_sesion(p_sesion_id) l
      join pedidos p on p.id = l.pedido_id
  ),
  disponible as (
    select coalesce((select sum(p.amount) from public.payments p
             where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED'), 0)
         - coalesce((select sum(p.total) from pedidos p join ligados l on l.pedido_id = p.id), 0) as monto
  ),
  restantes as (
    select p.id, sum(p.total) over (order by p.created_at, p.order_number) as acumulado
      from pedidos p
      where not exists (select 1 from ligados l where l.pedido_id = p.id)
  )
  select pedido_id from ligados
  union all
  select r.id from restantes r cross join disponible d where r.acumulado <= d.monto;
$$;

-- true si el pedido (no cancelado) está cubierto por pagos confirmados.
create function private.us105_pedido_pagado(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when o.table_session_id is not null then exists (
        select 1 from private.us105_pedidos_cubiertos_sesion(o.table_session_id) c where c.pedido_id = o.id)
      else exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'CONFIRMED')
        and private.saldo_pendiente_pedido(o.id) <= 0
    end
    from public.orders o where o.id = p_pedido_id and o.status <> 'CANCELLED'
  ), false);
$$;

revoke all on function private.us105_pagos_ligados_sesion(uuid) from public, anon, authenticated;
revoke all on function private.us105_pedidos_cubiertos_sesion(uuid) from public, anon, authenticated;
revoke all on function private.us105_pedido_pagado(uuid) from public, anon, authenticated;

-- Para las pantallas (mesero, admin): solo personal del restaurante del pedido.
create function public.pedido_pagado(p_pedido_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.orders where id = p_pedido_id;
  if v_restaurant is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if auth.uid() is null or not private.is_member(v_restaurant) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.us105_pedido_pagado(p_pedido_id);
end;
$$;
revoke all on function public.pedido_pagado(uuid) from public, anon;
grant execute on function public.pedido_pagado(uuid) to authenticated;

-- =====================================================================================
-- 2) Un pedido pagado entra a cocina y no vence, aunque la mesa deba otro pedido
-- =====================================================================================

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
  end if;

  -- US-105: antes solo pasaba a cocina si la mesa quedaba con saldo 0; ahora pasa cada
  -- pedido cubierto por lo pagado (los demás siguen esperando pago o vencen).
  for v_pedido in select * from public.orders o where o.table_session_id = new.table_session_id
    and o.restaurant_id = new.restaurant_id and o.status = 'PENDING'
    and o.id in (select c.pedido_id from private.us105_pedidos_cubiertos_sesion(new.table_session_id) c)
    order by o.id for update
  loop
    update public.orders set status = 'IN_PROGRESS' where id = v_pedido.id;
    if v_pedido.id = any(coalesce(v_order_ids, '{}')) then
      insert into public.order_status_history(order_id, restaurant_id, from_status,
        to_status, changed_by, reason, created_at)
      values (v_pedido.id, v_pedido.restaurant_id, 'PENDING', 'IN_PROGRESS', null,
        'US-097: pago Checkout', clock_timestamp());
    else
      insert into public.order_status_history(order_id, restaurant_id, from_status,
        to_status, changed_by, reason, created_at)
      values (v_pedido.id, v_pedido.restaurant_id, 'PENDING', 'IN_PROGRESS',
        coalesce(new.verified_by, new.created_by), 'US-094: pago confirmado', clock_timestamp());
    end if;
  end loop;
  return new;
end;
$$;

-- US-150 también cambiará esta función: un pedido cubierto por un pago confirmado nunca
-- vence (además de las protecciones de US-097 para Checkout activo y pagos por verificar).
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
    -- US-105: un pedido pagado no vence.
    if private.us105_pedido_pagado(v_pedido.id) then continue; end if;
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

-- =====================================================================================
-- 3) Devoluciones de pedidos pagados que se cancelan
-- =====================================================================================

create table public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  status text not null default 'PENDING' check (status in ('PENDING', 'REFUNDED')),
  requested_by uuid not null references public.users(id),
  requested_at timestamptz not null default now(),
  refunded_by uuid references public.users(id),
  refunded_at timestamptz,
  constraint order_refunds_marcada_check
    check ((status = 'REFUNDED') = (refunded_by is not null and refunded_at is not null))
);

create index order_refunds_restaurant_status_idx on public.order_refunds (restaurant_id, status, requested_at desc);

alter table public.order_refunds enable row level security;

-- Las leen caja, dueño y admin. Nadie escribe directo: solo cambiar_estado_pedido y
-- marcar_devolucion_realizada.
create policy order_refunds_read_cobro on public.order_refunds
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])));

revoke all on public.order_refunds from anon, authenticated;
grant select on public.order_refunds to authenticated;

create function public.marcar_devolucion_realizada(p_devolucion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_devolucion public.order_refunds%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_devolucion from public.order_refunds where id = p_devolucion_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_role(v_devolucion.restaurant_id, array['CASHIER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_devolucion.status <> 'PENDING' then raise exception 'ALREADY_REFUNDED' using errcode = '22023'; end if;
  update public.order_refunds
    set status = 'REFUNDED', refunded_by = v_user, refunded_at = now()
    where id = p_devolucion_id;
end;
$$;
revoke all on function public.marcar_devolucion_realizada(uuid) from public, anon;
grant execute on function public.marcar_devolucion_realizada(uuid) to authenticated;

-- Mismo cuerpo que US-106; cambia solo la cancelación de un pedido pagado.
CREATE OR REPLACE FUNCTION public.cambiar_estado_pedido(p_pedido_id uuid, p_estado text, p_motivo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(p_motivo), '');
  v_roles text[];
  v_pagado boolean := false;
  v_total numeric;
  v_saldo numeric;
  v_devolucion numeric;
begin
  if v_user is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
    where id = p_pedido_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_reason is not null and length(v_reason) > 200 then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;

  if (v_order.status, p_estado) in (
    ('IN_PROGRESS', 'READY'), ('READY', 'IN_PROGRESS'),
    ('READY', 'DELIVERED'), ('PENDING', 'CANCELLED'), ('ACCEPTED', 'CANCELLED'),
    ('IN_PROGRESS', 'CANCELLED')
  ) then
    null;
  else
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  if p_estado = 'CANCELLED' then
    if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  end if;

  -- US-106: preparar, listo y deshacer son de cocina; entregar, del mesero. Cancelar lo hace
  -- el mesero o, como excepción con motivo, el dueño o el admin.
  if p_estado in ('IN_PROGRESS', 'READY') then
    v_roles := array['KITCHEN'];
  elsif p_estado = 'DELIVERED' then
    v_roles := array['WAITER'];
  elsif p_estado = 'CANCELLED' then
    v_roles := array['WAITER', 'OWNER', 'ADMIN'];
  else
    v_roles := array['OWNER', 'ADMIN'];
  end if;

  if not private.has_role(v_order.restaurant_id, v_roles) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- US-105: un pedido con pago confirmado solo lo cancelan el dueño o el admin (con motivo,
  -- ya exigido arriba), y queda registrada la devolución pendiente.
  if p_estado = 'CANCELLED' then
    v_pagado := private.us105_pedido_pagado(v_order.id);
    if v_pagado and not private.has_role(v_order.restaurant_id, array['OWNER', 'ADMIN']) then
      raise exception 'PAID_ORDER_ADMIN_ONLY' using errcode = '42501';
    end if;
    if v_pagado then
      select coalesce(sum(oi.unit_price * oi.quantity), 0) into v_total
        from public.order_items oi where oi.order_id = v_order.id;
    end if;
  end if;

  -- Evaluar el reloj después de adquirir el bloqueo, incluso si hubo espera.
  if v_order.status = 'READY' and p_estado = 'IN_PROGRESS' and
     (v_order.ready_at is null or clock_timestamp() > v_order.ready_at + interval '5 minutes') then
    raise exception 'UNDO_EXPIRED' using errcode = '22023';
  end if;

  update public.orders
    set status = p_estado,
        ready_at = case when p_estado = 'READY' then clock_timestamp() else null end
    where id = v_order.id;
  insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, reason)
  values (v_order.id, v_order.restaurant_id, v_order.status, p_estado, v_user, v_reason);

  -- Se devuelve lo que sobra en la cuenta tras cancelar, como máximo el total del pedido.
  if v_pagado then
    v_saldo := case when v_order.table_session_id is not null
      then private.saldo_pendiente_sesion(v_order.table_session_id)
      else private.saldo_pendiente_pedido(v_order.id) end;
    v_devolucion := least(v_total, greatest(0, -v_saldo));
    if v_devolucion > 0 then
      insert into public.order_refunds (restaurant_id, order_id, amount, reason, requested_by)
      values (v_order.restaurant_id, v_order.id, v_devolucion, v_reason, v_user);
    end if;
  end if;
  return p_estado;
end;
$function$;

-- =====================================================================================
-- 4) Cobros con responsable
-- =====================================================================================

-- Mismo cuerpo que US-106. Cambia: nadie verifica un pago que registró (SELF_VERIFICATION);
-- si hay un solo cajero, el dueño o el admin verifican el pago de otra persona (desde
-- /admin/cuentas).
CREATE OR REPLACE FUNCTION public.verificar_pago(p_pago_id uuid, p_confirmar boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user  uuid := (select auth.uid());
  v_pago  public.payments%rowtype;
  v_saldo numeric;
begin
  if v_user is null or p_confirmar is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_pago from public.payments where id = p_pago_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_pago.restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_pago.created_by = v_user then
    raise exception 'SELF_VERIFICATION' using errcode = '42501';
  end if;

  -- Bloquea la cuenta igual que registrar_pago y vuelve a leer el pago ya bloqueado.
  if v_pago.table_session_id is not null then
    perform 1 from public.table_sessions where id = v_pago.table_session_id for update;
  else
    perform 1 from public.orders where id = v_pago.order_id for update;
  end if;
  select * into v_pago from public.payments where id = p_pago_id for update;
  if v_pago.status <> 'PENDING' then raise exception 'ALREADY_VERIFIED' using errcode = '22023'; end if;

  if p_confirmar then
    v_saldo := case when v_pago.table_session_id is not null
      then private.saldo_pendiente_sesion(v_pago.table_session_id)
      else private.saldo_pendiente_pedido(v_pago.order_id) end;
    if v_pago.amount > v_saldo then raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023'; end if;
  end if;

  update public.payments
    set status = case when p_confirmar then 'CONFIRMED' else 'FAILED' end,
        confirmed_at = case when p_confirmar then now() end,
        verified_by = v_user,
        verified_at = now()
    where id = p_pago_id;
  return case when p_confirmar then 'CONFIRMED' else 'FAILED' end;
end;
$function$;

-- Mismo cuerpo que US-102. Cambia: máximo 3 capturas pendientes por cuenta (un reintento
-- con la misma clave sigue devolviendo la captura ya guardada).
create or replace function public.registrar_pago_captura(
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
  -- US-105: límite de capturas por verificar en la misma cuenta (ya está bloqueada arriba).
  if (select count(*) from public.payment_proofs c
      where c.restaurant_id = v_restaurant and c.status = 'PENDING'
        and (c.table_session_id = p_sesion_id or c.order_id = p_pedido_id)) >= 3 then
    raise exception 'TOO_MANY_PENDING_PROOFS';
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

-- Saldo actual de una cuenta para caja: muestra el excedente de una captura antes de
-- confirmarla (el saldo pudo bajar desde que el cliente la subió).
create function public.saldo_cuenta_caja(p_sesion_id uuid, p_pedido_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
begin
  if (p_sesion_id is null) = (p_pedido_id is null) then raise exception 'INVALID_ACCOUNT' using errcode = '22023'; end if;
  select restaurant_id into v_restaurant from public.table_sessions where id = p_sesion_id;
  if v_restaurant is null then
    select restaurant_id into v_restaurant from public.orders where id = p_pedido_id;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if auth.uid() is null or not private.has_role(v_restaurant, array['CASHIER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return case when p_sesion_id is not null
    then private.saldo_pendiente_sesion(p_sesion_id)
    else private.saldo_pendiente_pedido(p_pedido_id) end;
end;
$$;
revoke all on function public.saldo_cuenta_caja(uuid, uuid) from public, anon;
grant execute on function public.saldo_cuenta_caja(uuid, uuid) to authenticated;

-- =====================================================================================
-- 5) Número de pedido del día (por restaurante, en hora de Lima, empieza en 1)
-- =====================================================================================
-- order_number sigue siendo el identificador interno (historial, enlaces, n8n, reportes).

alter table public.orders
  add column business_date date,
  add column daily_number integer check (daily_number > 0);

-- Contador por restaurante y día. El "insert ... on conflict do update" bloquea la fila
-- del día: dos pedidos simultáneos se numeran en fila, sin repetir. Si la transacción
-- del pedido falla, el contador también vuelve atrás.
create table private.order_daily_counters (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  last_number integer not null check (last_number > 0),
  primary key (restaurant_id, business_date)
);

-- Los pedidos anteriores reciben su número del día según su hora de creación. El trigger
-- de US-063 impide cambiar pedidos de mesas cerradas: se desactiva solo durante este
-- llenado, dentro de esta misma transacción, y se vuelve a activar abajo.
alter table public.orders disable trigger orders_us063_impedir_mesa_cerrada;

with numerados as (
  select id,
         (created_at at time zone 'America/Lima')::date as dia,
         row_number() over (
           partition by restaurant_id, (created_at at time zone 'America/Lima')::date
           order by created_at, order_number
         ) as numero
    from public.orders
)
update public.orders o
  set business_date = n.dia, daily_number = n.numero
  from numerados n
  where n.id = o.id;

alter table public.orders enable trigger orders_us063_impedir_mesa_cerrada;

insert into private.order_daily_counters (restaurant_id, business_date, last_number)
  select restaurant_id, business_date, max(daily_number)
    from public.orders group by restaurant_id, business_date;

alter table public.orders
  alter column business_date set not null,
  alter column daily_number set not null,
  add constraint orders_numero_dia_key unique (restaurant_id, business_date, daily_number);

create function private.us105_asignar_numero_dia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- El número del día no cambia nunca.
    new.business_date := old.business_date;
    new.daily_number := old.daily_number;
    return new;
  end if;
  new.business_date := (coalesce(new.created_at, now()) at time zone 'America/Lima')::date;
  insert into private.order_daily_counters as c (restaurant_id, business_date, last_number)
    values (new.restaurant_id, new.business_date, 1)
    on conflict (restaurant_id, business_date) do update set last_number = c.last_number + 1
    returning c.last_number into new.daily_number;
  return new;
end;
$$;
revoke all on function private.us105_asignar_numero_dia() from public, anon, authenticated, service_role;

-- Los BEFORE INSERT se ejecutan por orden alfabético: este va después de
-- orders_us097_limitar_pendientes_qr, que puede omitir la fila (no gasta un número).
create trigger orders_us105_numero_dia
  before insert or update of business_date, daily_number on public.orders
  for each row execute function private.us105_asignar_numero_dia();

commit;
