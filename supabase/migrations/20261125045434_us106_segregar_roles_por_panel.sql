-- US-106: segregar paneles y operaciones por rol.
-- Cada cuenta solo opera en el panel de su rol, también en la base:
--   dueño/admin  -> carta, stock, mesas, reportes, consultas y excepciones
--                   (cerrar con excepción, cancelar y modificar en preparación, con motivo)
--   mesero       -> abre/libera mesas, pedidos asistidos, entrega, llamados, reclamos
--   cocina       -> prepara, marca listo, deshace, incidencias de preparación
--   caja         -> registra pagos, verifica Yape/Plin, cierre normal
-- Cada función parte de su última definición (mismo cuerpo, solo cambian los roles):
--   registrar_pago .................. 20261115221935_us088_boletas_prueba
--   verificar_pago .................. 20261102120000_registrar_pagos
--   verificar_pago_captura .......... 20261116010000_us102_capturas_pago
--   cerrar_cuenta ................... 20261104120000_cierre_de_cuenta
--   cambiar_estado_pedido ........... 20261109172924_pedidos_directo_preparacion
--   modificar_pedido ................ 20261111180000_us078_bloqueo_stock_advisory
--   registrar_incidencia / resolver_incidencia ... 20261101150000_incidencias_pedido
--   atender_solicitud_ayuda ......... 20261101180000_solicitudes_ayuda
--   registrar_pedido_mesero (9 parámetros) y registrar_pedido_mesero_us108_interno
--                                     20261124230000_us108_alergias_pedido_asistido
-- No se recrea la versión antigua de registrar_pedido_mesero de 6 parámetros.
-- "create or replace" conserva los permisos (grant/revoke) que ya tenía cada función.
-- Los triggers de cierre de mesa (saldo 0, sin Yape por verificar ni pedidos por
-- entregar) no cambian: siguen valiendo para el mesero.

-- registrar_pago
CREATE OR REPLACE FUNCTION public.registrar_pago(p_sesion_id uuid, p_pedido_id uuid, p_metodo text, p_monto numeric, p_recibido numeric, p_referencia text, p_aprobado boolean, p_clave uuid, p_receipt_email text DEFAULT NULL::text)
 RETURNS TABLE(pago_id uuid, estado text, vuelto numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user       uuid := (select auth.uid());
  v_restaurant uuid;
  v_saldo      numeric;
  v_estado     text;
  v_referencia text := nullif(trim(p_referencia), '');
  v_existente  public.payments%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_clave is null or ((p_sesion_id is null) = (p_pedido_id is null)) then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  -- Bloquea la cuenta: dos pagos a la vez sobre la misma cuenta se hacen en fila.
  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions
      where id = p_sesion_id and closed_at is null for update;
  else
    select restaurant_id into v_restaurant from public.orders
      where id = p_pedido_id and modality = 'TAKEAWAY' and status <> 'CANCELLED' for update;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_restaurant, array['CASHIER'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Reintento (doble clic, red lenta): mismo usuario + misma clave = mismo pago.
  select * into v_existente from public.payments where created_by = v_user and idempotency_key = p_clave;
  if found then
    if v_existente.table_session_id is distinct from p_sesion_id
       or v_existente.order_id is distinct from p_pedido_id
       or v_existente.method <> p_metodo or v_existente.amount <> p_monto then
      raise exception 'INVALID_PAYMENT' using errcode = '22023';
    end if;
    return query select v_existente.id, v_existente.status, v_existente.change_amount;
    return;
  end if;

  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  if p_metodo = 'CASH' then
    if p_recibido is null or p_recibido <> round(p_recibido, 2) or v_referencia is not null or p_aprobado is not null then
      raise exception 'INVALID_PAYMENT' using errcode = '22023';
    end if;
    if p_recibido < p_monto then raise exception 'INSUFFICIENT_CASH' using errcode = '22023'; end if;
    v_estado := 'CONFIRMED';
  elsif p_metodo = 'YAPE' then
    if p_recibido is not null or p_aprobado is not null or v_referencia is null
       or v_referencia !~ '^[A-Za-z0-9-]{3,40}$' then
      raise exception 'INVALID_PAYMENT' using errcode = '22023';
    end if;
    v_estado := 'PENDING';
  elsif p_metodo = 'CARD' then
    if p_recibido is not null or p_aprobado is null or v_referencia is null
       or v_referencia !~ '^[A-Za-z0-9-]{3,40}$' then
      raise exception 'INVALID_PAYMENT' using errcode = '22023';
    end if;
    v_estado := case when p_aprobado then 'CONFIRMED' else 'FAILED' end;
  else
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  -- No se puede cobrar más de lo que se debe (un rechazo no cobra nada, así que no se valida).
  if v_estado <> 'FAILED' then
    v_saldo := case when p_sesion_id is not null
      then private.saldo_pendiente_sesion(p_sesion_id)
      else private.saldo_pendiente_pedido(p_pedido_id) end;
    if v_saldo <= 0 then raise exception 'NOTHING_TO_PAY' using errcode = '22023'; end if;
    if p_monto > v_saldo then raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023'; end if;
  end if;

  insert into public.payments (
    restaurant_id, table_session_id, order_id, method, status, amount,
    received_amount, change_amount, reference, idempotency_key, created_by, confirmed_at, receipt_email
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, p_metodo, v_estado, p_monto,
    case when p_metodo = 'CASH' then p_recibido end,
    case when p_metodo = 'CASH' then p_recibido - p_monto end,
    v_referencia, p_clave, v_user,
    case when v_estado = 'CONFIRMED' then now() end, nullif(trim(p_receipt_email), '')
  )
  returning * into v_existente;

  return query select v_existente.id, v_existente.status, v_existente.change_amount;
end;
$function$;

-- verificar_pago
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
  if not (select private.has_role(v_pago.restaurant_id, array['CASHIER'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
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

-- verificar_pago_captura
CREATE OR REPLACE FUNCTION public.verificar_pago_captura(p_captura_id uuid, p_resultado text, p_monto_recibido numeric, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c public.payment_proofs%rowtype;
  v_pago public.payments%rowtype;
  v_monto numeric;
  v_saldo numeric;
  v_hora timestamptz := now();
begin
  select * into v_c from public.payment_proofs where id = p_captura_id;
  if not found then raise exception 'PROOF_NOT_FOUND'; end if;
  if auth.uid() is null or not private.has_role(v_c.restaurant_id,array['CASHIER']) then
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
$function$;

-- cerrar_cuenta
CREATE OR REPLACE FUNCTION public.cerrar_cuenta(p_sesion_id uuid, p_pedido_id uuid, p_motivo text)
 RETURNS TABLE(cierre_id uuid, tipo text, consumo numeric, pagado numeric, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user       uuid := (select auth.uid());
  v_restaurant uuid;
  v_motivo     text := nullif(btrim(p_motivo), '');
  v_consumo    numeric;
  v_pagado     numeric;
  v_tipo       text;
  v_cierre     public.account_closures%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (p_sesion_id is null) = (p_pedido_id is null) then
    raise exception 'INVALID_CLOSURE' using errcode = '22023';
  end if;

  -- Bloquea la cuenta igual que registrar_pago: un pago y un cierre a la vez se hacen en fila.
  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions
      where id = p_sesion_id and closed_at is null for update;
  else
    select restaurant_id into v_restaurant from public.orders
      where id = p_pedido_id and modality = 'TAKEAWAY' for update;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_restaurant, array['CASHIER', 'OWNER', 'ADMIN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- US-106: el cierre normal es de caja. La excepción sigue siendo del dueño o el admin (más abajo).
  if v_motivo is null and not (select private.has_role(v_restaurant, array['CASHIER'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_closures c
               where c.table_session_id = p_sesion_id or c.order_id = p_pedido_id) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '22023';
  end if;

  -- Un pago sin verificar no es dinero recibido ni rechazado: no se cierra hasta resolverlo.
  if exists (select 1 from public.payments p
               where p.status = 'PENDING' and (p.table_session_id = p_sesion_id or p.order_id = p_pedido_id)) then
    raise exception 'PENDING_PAYMENTS' using errcode = '22023';
  end if;

  select i.consumo, i.pagado into v_consumo, v_pagado from private.importes_cuenta(p_sesion_id, p_pedido_id) i;

  if v_motivo is null then
    if v_consumo - v_pagado > 0 then raise exception 'SALDO_PENDIENTE' using errcode = '22023'; end if;
    v_tipo := 'ORDINARY';
  else
    if v_consumo - v_pagado <= 0 then raise exception 'EXCEPTION_NOT_NEEDED' using errcode = '22023'; end if;
    if not (select private.has_role(v_restaurant, array['OWNER', 'ADMIN'])) then
      raise exception 'EXCEPTION_FORBIDDEN' using errcode = '42501';
    end if;
    if char_length(v_motivo) not between 10 and 300 then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    v_tipo := 'EXCEPTION';
  end if;

  insert into public.account_closures (
    restaurant_id, table_session_id, order_id, kind, consumption, paid, balance, reason, closed_by
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, v_tipo, v_consumo, v_pagado, v_consumo - v_pagado, v_motivo, v_user
  )
  returning * into v_cierre;

  -- La mesa queda libre. Los triggers ven el cierre recién guardado.
  if p_sesion_id is not null then
    update public.table_sessions set closed_at = v_cierre.closed_at, closed_by = v_user where id = p_sesion_id;
  end if;

  return query select v_cierre.id, v_cierre.kind, v_cierre.consumption, v_cierre.paid, v_cierre.balance;
end;
$function$;

-- cambiar_estado_pedido
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
  return p_estado;
end;
$function$;

-- modificar_pedido
CREATE OR REPLACE FUNCTION public.modificar_pedido(p_pedido_id uuid, p_cambios jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_product_id uuid;
  v_restaurant_id uuid;
begin
  select o.restaurant_id into v_restaurant_id from public.orders o where o.id = p_pedido_id;
  if not found then
    return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
  end if;
  if not private.has_role(v_restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_pedido_id for update;
  if not found then
    return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
  end if;
  -- US-106: el mesero modifica pedidos pendientes; en preparación solo el dueño o el admin,
  -- con motivo (eso lo revisa modificar_pedido_sin_bloqueo_stock).
  if v_order.status in ('PENDING', 'ACCEPTED') and not private.has_role(v_order.restaurant_id, array['WAITER']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Bloquear todos los artículos aunque solo cambie uno, siempre en orden.
  for v_product_id in
    select product_ids.product_id
    from (
      select oi.product_id
        from public.order_items oi
        where oi.order_id = v_order.id
      union
      select changed.product_id
        from jsonb_array_elements(
          case when jsonb_typeof(p_cambios) = 'array' then p_cambios else '[]'::jsonb end
        ) change(value)
        join public.order_items changed
          on changed.id = case
            when change.value->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (change.value->>'itemId')::uuid
            else null
          end
          and changed.order_id = v_order.id
    ) product_ids
    order by product_ids.product_id
  loop
    perform public.bloquear_stock_diario(
      v_order.restaurant_id, v_product_id, (v_order.created_at at time zone 'America/Lima')::date
    );
  end loop;

  return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
end;
$function$;

-- registrar_incidencia
CREATE OR REPLACE FUNCTION public.registrar_incidencia(p_pedido_id uuid, p_tipo text, p_descripcion text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_id uuid;
  v_description text := trim(p_descripcion);
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_pedido_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_role(v_order.restaurant_id, array['WAITER', 'KITCHEN'])) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in (
       'FALTANTE', 'ERROR', 'RECLAMO', 'OTRO', 'SIN_INGREDIENTES', 'PROBLEMA_PREPARACION'
     ) or v_description is null
     or length(v_description) not between 3 and 300 or v_order.status = 'CANCELLED' then
    raise exception 'INVALID_INCIDENT' using errcode = '22023';
  end if;
  -- US-106: el mesero registra reclamos del cliente; cocina, los de preparación. «OTRO», ambos.
  if not (
    (p_tipo in ('FALTANTE', 'ERROR', 'RECLAMO', 'OTRO') and private.has_role(v_order.restaurant_id, array['WAITER']))
    or (p_tipo in ('SIN_INGREDIENTES', 'PROBLEMA_PREPARACION', 'OTRO') and private.has_role(v_order.restaurant_id, array['KITCHEN']))
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.order_incidents (restaurant_id, order_id, type, description, created_by)
  values (v_order.restaurant_id, v_order.id, p_tipo, v_description, v_user) returning id into v_id;
  return v_id;
end;
$function$;

-- resolver_incidencia
CREATE OR REPLACE FUNCTION public.resolver_incidencia(p_incidencia_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_incident public.order_incidents%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_incident from public.order_incidents where id = p_incidencia_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  -- US-106: cada uno resuelve las de su tipo (mesero: reclamos; cocina: preparación).
  if not (
    (v_incident.type in ('FALTANTE', 'ERROR', 'RECLAMO', 'OTRO') and private.has_role(v_incident.restaurant_id, array['WAITER']))
    or (v_incident.type in ('SIN_INGREDIENTES', 'PROBLEMA_PREPARACION', 'OTRO') and private.has_role(v_incident.restaurant_id, array['KITCHEN']))
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_incident.status = 'RESOLVED' then raise exception 'ALREADY_RESOLVED' using errcode = '22023'; end if;
  update public.order_incidents set status = 'RESOLVED', resolved_by = v_user, resolved_at = now()
    where id = p_incidencia_id;
end;
$function$;

-- atender_solicitud_ayuda
CREATE OR REPLACE FUNCTION public.atender_solicitud_ayuda(p_solicitud_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_request public.help_requests%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select h.* into v_request from public.help_requests h
    where h.id = p_solicitud_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_role(v_request.restaurant_id, array['WAITER']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_request.status = 'ATTENDED' then
    raise exception 'ALREADY_ATTENDED' using errcode = '22023';
  end if;

  update public.help_requests
    set status = 'ATTENDED', attended_by = v_user, attended_at = now()
    where id = v_request.id;
end;
$function$;

-- registrar_pedido_mesero
CREATE OR REPLACE FUNCTION public.registrar_pedido_mesero(p_restaurant_id uuid, p_modality text, p_dining_table_id uuid, p_branch_id uuid, p_idempotency_key uuid, p_items jsonb, p_alergia_respuesta text DEFAULT NULL::text, p_alergenos text[] DEFAULT NULL::text[], p_alergia_detalle text DEFAULT NULL::text)
 RETURNS TABLE(pedido_id uuid, numero_pedido bigint, repetido boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pedido record;
begin
  if not private.has_role(p_restaurant_id, array['WAITER']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_alergia_respuesta is null then
    if coalesce(cardinality(p_alergenos), 0) > 0 or nullif(trim(p_alergia_detalle), '') is not null then
      raise exception 'INVALID_ALLERGY' using errcode = '22023';
    end if;
  elsif p_alergia_respuesta not in ('NONE', 'YES') or p_alergenos is null
    or cardinality(p_alergenos) > 6 or array_position(p_alergenos, null) is not null
    or not (p_alergenos <@ array['MANI','MARISCOS','PESCADO','GLUTEN','LACTEOS','HUEVO']::text[])
    or length(p_alergia_detalle) > 120
    or (p_alergia_respuesta = 'YES' and cardinality(p_alergenos) = 0 and nullif(trim(p_alergia_detalle), '') is null)
    or (p_alergia_respuesta = 'NONE' and (cardinality(p_alergenos) > 0 or nullif(trim(p_alergia_detalle), '') is not null)) then
    raise exception 'INVALID_ALLERGY' using errcode = '22023';
  end if;

  select * into v_pedido from public.registrar_pedido_mesero_us108_interno(
    p_restaurant_id, p_modality, p_dining_table_id, p_branch_id, p_idempotency_key, p_items
  );
  if not v_pedido.repetido and p_alergia_respuesta is not null then
    update public.orders set allergy_answer = p_alergia_respuesta, allergens = p_alergenos,
      allergy_note = nullif(trim(p_alergia_detalle), '')
    where id = v_pedido.pedido_id and restaurant_id = p_restaurant_id;
  end if;
  return query select v_pedido.pedido_id::uuid, v_pedido.numero_pedido::bigint, v_pedido.repetido::boolean;
end;
$function$;

-- registrar_pedido_mesero_us108_interno
CREATE OR REPLACE FUNCTION public.registrar_pedido_mesero_us108_interno(p_restaurant_id uuid, p_modality text, p_dining_table_id uuid, p_branch_id uuid, p_idempotency_key uuid, p_items jsonb)
 RETURNS TABLE(pedido_id uuid, numero_pedido bigint, repetido boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.has_role(p_restaurant_id, array['WAITER']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.bloquear_stock_items(
    p_restaurant_id, (now() at time zone 'America/Lima')::date, p_items
  );
  return query select * from public.registrar_pedido_mesero_sin_bloqueo_stock(
    p_restaurant_id, p_modality, p_dining_table_id, p_branch_id, p_idempotency_key, p_items
  );
end;
$function$;

-- Políticas: abrir y liberar mesas solo el mesero (caja cierra con cerrar_cuenta).
drop policy table_sessions_insert_staff on public.table_sessions;
create policy table_sessions_insert_staff on public.table_sessions
  for insert to authenticated
  with check (
    (select private.has_role(restaurant_id, array['WAITER']))
    and opened_by = (select auth.uid())
    and closed_at is null
    and closed_by is null
  );

drop policy table_sessions_close_staff on public.table_sessions;
create policy table_sessions_close_staff on public.table_sessions
  for update to authenticated
  using (
    closed_at is null
    and (select private.has_role(restaurant_id, array['WAITER']))
  )
  with check (
    closed_at is not null
    and closed_by = (select auth.uid())
    and (select private.has_role(restaurant_id, array['WAITER']))
  );

-- El mesero ya no consulta cobros: pagos, cierres y capturas los leen caja, dueño y admin.
-- (El panel del mesero recibe solo "Lista para liberar" / "Falta pagar en caja" desde el servidor.)
drop policy payments_read_cobro on public.payments;
create policy payments_read_cobro on public.payments
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])));

drop policy account_closures_read_cobro on public.account_closures;
create policy account_closures_read_cobro on public.account_closures
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])));

drop policy payment_proofs_read_staff on public.payment_proofs;
create policy payment_proofs_read_staff on public.payment_proofs
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])));
