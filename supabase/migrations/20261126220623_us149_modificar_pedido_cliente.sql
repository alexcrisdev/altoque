-- US-149: edición del pedido QR antes del pago; conserva las funciones del personal.
begin;

create function private.us149_pedido_qr(p_token_hash text, p_clave uuid)
returns public.orders
language sql stable security definer set search_path = ''
as $$
  select o.*
  from public.orders o
  join public.qr_codes q on q.id = o.qr_code_id
    and q.restaurant_id = o.restaurant_id and q.branch_id = o.branch_id
  join public.branches b on b.id = q.branch_id and b.restaurant_id = q.restaurant_id
  join public.restaurants r on r.id = q.restaurant_id
  left join public.dining_tables m on m.id = q.dining_table_id and m.branch_id = q.branch_id
  where q.token_hash = p_token_hash and o.idempotency_key = p_clave
    and o.source = 'QR' and q.active and b.active and r.active
    and (q.purpose = 'TAKEAWAY' or m.active)
    and (o.modality = 'TAKEAWAY' or (q.purpose = 'DINE_IN' and o.dining_table_id = m.id));
$$;

create function private.us149_bloqueo_edicion(p_pedido public.orders)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pago_aplicable boolean;
begin
  if p_pedido.status <> 'PENDING' then return 'INVALID_STATE'; end if;
  if p_pedido.table_session_id is not null and not exists (
    select 1 from public.table_sessions s where s.id = p_pedido.table_session_id
      and s.restaurant_id = p_pedido.restaurant_id and s.branch_id = p_pedido.branch_id
      and s.dining_table_id = p_pedido.dining_table_id and s.closed_at is null
  ) then
    return 'ACCOUNT_CLOSED';
  end if;

  if private.us105_pedido_pagado(p_pedido.id) then return 'PAYMENT_CONFIRMED'; end if;
  if p_pedido.table_session_id is null then
    select exists (select 1 from public.payments p where p.restaurant_id = p_pedido.restaurant_id
      and p.order_id = p_pedido.id and p.status = 'CONFIRMED') into v_pago_aplicable;
  else
    -- US-105: el Checkout confirmado se destina a sus pedidos; el resto cubre
    -- primero los pedidos anteriores. Protege también un abono parcial al actual.
    with ligados as (
      select distinct pedido_id from private.us105_pagos_ligados_sesion(p_pedido.table_session_id)
    ), consumo_anterior_o_ligado as (
      select coalesce(sum(oi.unit_price * oi.quantity), 0) as monto
      from public.orders o join public.order_items oi on oi.order_id = o.id
      where o.restaurant_id = p_pedido.restaurant_id and o.table_session_id = p_pedido.table_session_id
        and o.status <> 'CANCELLED'
        and (exists (select 1 from ligados l where l.pedido_id = o.id)
          or (o.created_at, o.order_number) < (p_pedido.created_at, p_pedido.order_number))
    )
    select coalesce(sum(p.amount), 0) > (select monto from consumo_anterior_o_ligado)
      into v_pago_aplicable
      from public.payments p where p.restaurant_id = p_pedido.restaurant_id
        and p.table_session_id = p_pedido.table_session_id and p.status = 'CONFIRMED';
  end if;
  if v_pago_aplicable then return 'PAYMENT_CONFIRMED'; end if;

  if exists (select 1 from public.payments p where p.restaurant_id = p_pedido.restaurant_id
    and p.status = 'PENDING' and (p.order_id = p_pedido.id or p.table_session_id = p_pedido.table_session_id)) then
    return 'PAYMENT_PENDING';
  end if;
  if exists (select 1 from public.stripe_checkout_attempts c
    where c.restaurant_id = p_pedido.restaurant_id and c.status in ('CREATING', 'OPEN')
      and c.expires_at > clock_timestamp()
      and (c.order_id = p_pedido.id or c.table_session_id = p_pedido.table_session_id)
      and p_pedido.id = any(c.order_ids)) then
    return 'CHECKOUT_OPEN';
  end if;
  if p_pedido.created_at <= clock_timestamp() - interval '15 minutes' then return 'ORDER_EXPIRED'; end if;
  return null;
end;
$$;

create function private.us149_items_edicion(p_pedido_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'nombre', i.product_name, 'cantidad', i.quantity,
    'precioUnitarioCentimos', (i.unit_price * 100)::bigint, 'observacion', i.observation
  ) order by i.id), '[]'::jsonb)
  from public.order_items i where i.order_id = p_pedido_id;
$$;

create function public.leer_edicion_pedido_cliente(p_token_hash text, p_clave uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pedido public.orders%rowtype;
  v_bloqueo text;
  v_items jsonb;
begin
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is null then return null; end if;
  v_bloqueo := private.us149_bloqueo_edicion(v_pedido);
  if v_bloqueo is not null then return jsonb_build_object('bloqueo', v_bloqueo); end if;
  v_items := private.us149_items_edicion(v_pedido.id);
  return jsonb_build_object('items', v_items, 'revision', md5(v_items::text));
end;
$$;

create function public.modificar_pedido_cliente(
  p_token_hash text, p_clave uuid, p_revision text, p_cambios jsonb, p_confirmar_anulacion boolean
)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '2s'
as $$
declare
  v_pedido public.orders%rowtype;
  v_id uuid;
  v_bloqueo text;
  v_producto uuid;
  v_cambio jsonb;
  v_item public.order_items%rowtype;
  v_cantidad integer;
  v_observacion text;
  v_ids uuid[] := '{}';
  v_quitados integer := 0;
  v_total numeric;
  v_detalle text;
  v_cantidad_items integer;
begin
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  v_id := v_pedido.id;

  -- Orden de bloqueo de caja, capturas, Checkout y vencimiento: sesión, luego pedido.
  -- Consultar intentos de Stripe sin bloquear sus filas: su webhook las bloquea primero.
  if v_pedido.table_session_id is not null then
    perform 1 from public.table_sessions s where s.id = v_pedido.table_session_id
      and s.restaurant_id = v_pedido.restaurant_id for update;
  end if;
  perform 1 from public.orders o where o.id = v_id for update;
  perform 1 from public.qr_codes q where q.id = v_pedido.qr_code_id and q.token_hash = p_token_hash for share;
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is distinct from v_id then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  v_bloqueo := private.us149_bloqueo_edicion(v_pedido);
  if v_bloqueo is not null then raise exception '%', v_bloqueo using errcode = '22023'; end if;
  if p_revision is distinct from md5(private.us149_items_edicion(v_id)::text) then
    raise exception 'ORDER_CHANGED' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cambios) is distinct from 'array' or p_confirmar_anulacion is null then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;
  select count(*) into v_cantidad_items from public.order_items i where i.order_id = v_id;
  if jsonb_array_length(p_cambios) not between 1 and v_cantidad_items then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;

  for v_cambio in select value from jsonb_array_elements(p_cambios)
  loop
    if jsonb_typeof(v_cambio) <> 'object'
      or not coalesce((v_cambio->>'itemId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
      or jsonb_typeof(v_cambio->'cantidad') is distinct from 'number'
      or not coalesce((v_cambio->>'cantidad') ~ '^(0|[1-9]|1[0-9]|20)$', false)
      or (v_cambio ? 'observacion' and (jsonb_typeof(v_cambio->'observacion') not in ('string', 'null')
        or length(trim(v_cambio->>'observacion')) > 140)) then
      raise exception 'INVALID_CHANGES' using errcode = '22023';
    end if;
    select * into v_item from public.order_items i where i.id = (v_cambio->>'itemId')::uuid and i.order_id = v_id;
    if not found or v_item.id = any(v_ids) then raise exception 'INVALID_CHANGES' using errcode = '22023'; end if;
    v_ids := array_append(v_ids, v_item.id);
    if (v_cambio->>'cantidad')::int = 0 then v_quitados := v_quitados + 1; end if;
  end loop;

  if v_quitados = v_cantidad_items and not p_confirmar_anulacion then
    raise exception 'CANCEL_CONFIRMATION_REQUIRED' using errcode = '22023';
  elsif v_quitados <> v_cantidad_items and p_confirmar_anulacion then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;

  -- Los triggers devuelven/reservan stock. Se toman primero los mismos bloqueos
  -- por producto y fecha de Lima que usa el cambio del personal. El timeout
  -- permite reintentar si un nuevo pedido ya tomó stock y espera la sesión.
  for v_producto in select distinct product_id from public.order_items
    where order_id = v_id order by product_id
  loop
    perform public.bloquear_stock_diario(
      v_pedido.restaurant_id, v_producto, (v_pedido.created_at at time zone 'America/Lima')::date
    );
  end loop;

  if p_confirmar_anulacion then
    -- Conserva las líneas originales para auditoría. El trigger de cancelación libera el stock.
    update public.orders set status = 'CANCELLED' where id = v_id;
    insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, reason)
      values (v_id, v_pedido.restaurant_id, 'PENDING', 'CANCELLED', null, 'Anulado por el cliente');
    return jsonb_build_object('cancelado', true, 'totalCentimos', 0);
  end if;

  for v_cambio in select c.value from jsonb_array_elements(p_cambios) c(value)
    join public.order_items i on i.id = (c.value->>'itemId')::uuid and i.order_id = v_id
    order by (c.value->>'cantidad')::int > i.quantity, i.id
  loop
    select * into v_item from public.order_items where id = (v_cambio->>'itemId')::uuid and order_id = v_id;
    v_cantidad := (v_cambio->>'cantidad')::int;
    v_observacion := case when v_cambio ? 'observacion' then nullif(trim(v_cambio->>'observacion'), '')
      else v_item.observation end;
    if v_cantidad = 0 then
      delete from public.order_items where id = v_item.id and order_id = v_id;
      v_detalle := concat_ws('; ', v_detalle, 'quitado ' || v_item.product_name);
    elsif v_cantidad is distinct from v_item.quantity or v_observacion is distinct from v_item.observation then
      if v_cantidad > v_item.quantity then
        perform 1 from public.products p where p.id = v_item.product_id
          and p.restaurant_id = v_pedido.restaurant_id and p.active and p.available for share;
        if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode = '22023'; end if;
      end if;
      update public.order_items set quantity = v_cantidad, observation = v_observacion,
        subtotal = unit_price * v_cantidad where id = v_item.id and order_id = v_id;
      if v_cantidad <> v_item.quantity then
        v_detalle := concat_ws('; ', v_detalle, v_item.product_name || ' ' || v_item.quantity || ' → ' || v_cantidad);
      end if;
      if v_observacion is distinct from v_item.observation then
        v_detalle := concat_ws('; ', v_detalle, 'observación de ' || v_item.product_name || ' actualizada');
      end if;
    end if;
  end loop;

  select sum(subtotal) into v_total from public.order_items where order_id = v_id;
  if v_detalle is not null then
    update public.orders set total = v_total where id = v_id;
    insert into public.order_status_history
      (order_id, restaurant_id, from_status, to_status, changed_by, reason, event, detail)
      values (v_id, v_pedido.restaurant_id, 'PENDING', 'PENDING', null, null, 'MODIFIED', left(v_detalle, 500));
  end if;
  return jsonb_build_object('cancelado', false, 'totalCentimos', (v_total * 100)::bigint);
end;
$$;

revoke all on function private.us149_pedido_qr(text, uuid) from public, anon, authenticated;
revoke all on function private.us149_bloqueo_edicion(public.orders) from public, anon, authenticated;
revoke all on function private.us149_items_edicion(uuid) from public, anon, authenticated;
revoke all on function public.leer_edicion_pedido_cliente(text, uuid) from public, anon, authenticated;
revoke all on function public.modificar_pedido_cliente(text, uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.leer_edicion_pedido_cliente(text, uuid) to service_role;
grant execute on function public.modificar_pedido_cliente(text, uuid, text, jsonb, boolean) to service_role;

commit;
