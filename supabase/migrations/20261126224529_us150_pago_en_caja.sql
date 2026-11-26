-- US-150: reservar tiempo para pagar en caja y aplicar efectivo al pedido indicado.
begin;

alter table public.orders
  add column pago_en_caja_desde timestamptz,
  add column pago_en_caja_hasta timestamptz;

alter table public.payments
  add column pedido_efectivo_id uuid references public.orders(id),
  add constraint payments_pedido_efectivo_check check (
    pedido_efectivo_id is null or (table_session_id is not null and method = 'CASH')
  );

create index orders_pago_en_caja_idx on public.orders (restaurant_id, pago_en_caja_desde)
  where status = 'PENDING' and pago_en_caja_desde is not null;
create index payments_pedido_efectivo_idx on public.payments (pedido_efectivo_id)
  where pedido_efectivo_id is not null;

create function private.us150_limite_pago(p_pedido public.orders)
returns timestamptz language sql stable set search_path = '' as $$
  select coalesce(p_pedido.pago_en_caja_hasta, p_pedido.created_at + interval '15 minutes');
$$;

-- Última definición de US-105. Los cobros de efectivo dirigidos se suman a los
-- pedidos ya ligados por Checkout. Un cobro dirigido cubre todo el saldo del pedido.
create or replace function private.us105_pagos_ligados_sesion(p_sesion_id uuid)
returns table (pago_id uuid, pedido_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, unnest(c.order_ids)
    from public.payments p
    join public.stripe_checkout_attempts c on c.checkout_session_id = p.stripe_session_id
    where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED'
  union all
  select p.id, p.pedido_efectivo_id from public.payments p
    where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED' and p.pedido_efectivo_id is not null;
$$;

-- Mismo reparto de US-105: primero los ligados, después los demás en orden.
-- Un cobro dirigido a un pedido luego cancelado queda reservado para su
-- devolución y no pasa a cubrir otros pedidos de esa sesión.
create function private.us150_saldos_pedidos_sesion(p_sesion_id uuid)
returns table (pedido_id uuid, saldo numeric)
language sql stable security definer set search_path = '' as $$
  with pedidos as (
    select o.id, o.status, o.created_at, o.order_number, coalesce(sum(oi.unit_price * oi.quantity), 0) as total
    from public.orders o left join public.order_items oi on oi.order_id = o.id
    where o.table_session_id = p_sesion_id group by o.id
  ), ligados as (
    select distinct l.pedido_id from private.us105_pagos_ligados_sesion(p_sesion_id) l
  ), disponible as (
    select coalesce((select sum(p.amount) from public.payments p
      where p.table_session_id = p_sesion_id and p.status = 'CONFIRMED'), 0)
      - coalesce((select sum(o.total) from pedidos o join ligados l on l.pedido_id = o.id
        where o.status <> 'CANCELLED' or exists (
          select 1 from public.payments p where p.table_session_id = p_sesion_id
            and p.status = 'CONFIRMED' and p.pedido_efectivo_id = o.id
        )), 0) as monto
  ), restantes as (
    select o.id, o.total, sum(o.total) over (order by o.created_at, o.order_number) as acumulado
    from pedidos o where o.status <> 'CANCELLED' and not exists (select 1 from ligados l where l.pedido_id = o.id)
  )
  select o.id, 0::numeric from pedidos o join ligados l on l.pedido_id = o.id where o.status <> 'CANCELLED'
  union all
  select r.id, greatest(0, least(r.total, r.acumulado - d.monto)) from restantes r cross join disponible d;
$$;

create or replace function private.us105_pedidos_cubiertos_sesion(p_sesion_id uuid)
returns table (pedido_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.pedido_id from private.us150_saldos_pedidos_sesion(p_sesion_id) s where s.saldo = 0;
$$;

create function private.us150_saldo_pedido(p_pedido public.orders)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when p_pedido.table_session_id is null then private.saldo_pendiente_pedido(p_pedido.id)
    else (select s.saldo from private.us150_saldos_pedidos_sesion(p_pedido.table_session_id) s
      where s.pedido_id = p_pedido.id) end;
$$;

create function private.us150_pago_en_curso(p_pedido public.orders)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payments p where p.restaurant_id = p_pedido.restaurant_id
    and p.status = 'PENDING' and (p.order_id = p_pedido.id or p.table_session_id = p_pedido.table_session_id))
    or exists (select 1 from public.stripe_checkout_attempts c
      where c.restaurant_id = p_pedido.restaurant_id and c.status in ('CREATING', 'OPEN')
        and c.expires_at > clock_timestamp() and p_pedido.id = any(c.order_ids)
        and (c.order_id = p_pedido.id or c.table_session_id = p_pedido.table_session_id));
$$;

create function private.us150_sesion_vigente(p_pedido public.orders)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_pedido.table_session_id is null or exists (
    select 1 from public.table_sessions s where s.id = p_pedido.table_session_id
      and s.restaurant_id = p_pedido.restaurant_id and s.branch_id = p_pedido.branch_id
      and s.dining_table_id = p_pedido.dining_table_id and s.closed_at is null);
$$;

create function public.leer_pago_en_caja_cliente(p_token_hash text, p_clave uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
  v_saldo numeric;
begin
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is null or v_pedido.status <> 'PENDING' or not private.us150_sesion_vigente(v_pedido) then return null; end if;
  if private.us150_limite_pago(v_pedido) <= clock_timestamp() then return null; end if;
  v_saldo := private.us150_saldo_pedido(v_pedido);
  if v_saldo is null or v_saldo <= 0 then return null; end if;
  return jsonb_build_object('solicitado', v_pedido.pago_en_caja_desde is not null,
    'disponible', not private.us150_pago_en_curso(v_pedido),
    'numero', v_pedido.daily_number, 'saldoCentimos', (v_saldo * 100)::bigint,
    'limitePago', private.us150_limite_pago(v_pedido));
end;
$$;

create function public.elegir_pago_en_caja_cliente(p_token_hash text, p_clave uuid, p_elegir boolean)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v_pedido public.orders%rowtype;
  v_id uuid;
  v_saldo numeric;
begin
  if p_elegir is null then raise exception 'INVALID_PAYMENT'; end if;
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  v_id := v_pedido.id;
  if v_pedido.table_session_id is not null then
    perform 1 from public.table_sessions s where s.id = v_pedido.table_session_id
      and s.restaurant_id = v_pedido.restaurant_id for update;
  end if;
  perform 1 from public.orders o where o.id = v_id for update;
  perform 1 from public.qr_codes q where q.id = v_pedido.qr_code_id and q.token_hash = p_token_hash for share;
  select * into v_pedido from private.us149_pedido_qr(p_token_hash, p_clave);
  if v_pedido.id is distinct from v_id then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_pedido.status <> 'PENDING' or not private.us150_sesion_vigente(v_pedido)
    or private.us150_limite_pago(v_pedido) <= clock_timestamp() then raise exception 'INVALID_STATE'; end if;
  v_saldo := private.us150_saldo_pedido(v_pedido);
  if v_saldo is null or v_saldo <= 0 then raise exception 'NOTHING_TO_PAY'; end if;
  if p_elegir and private.us150_pago_en_curso(v_pedido) then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  update public.orders o set
    pago_en_caja_desde = case when p_elegir then coalesce(o.pago_en_caja_desde, clock_timestamp()) end,
    pago_en_caja_hasta = case when p_elegir then coalesce(o.pago_en_caja_hasta, o.created_at + interval '30 minutes')
      else o.pago_en_caja_hasta end
    where o.id = v_id;
  return public.leer_pago_en_caja_cliente(p_token_hash, p_clave);
end;
$$;

create function public.listar_pedidos_pago_en_caja(p_restaurante uuid, p_pedido uuid default null)
returns table (pedido_id uuid, mesa_sesion_id uuid, mesa_numero integer, numero bigint,
  dia date, solicitado_en timestamptz, saldo_centimos bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_role(p_restaurante, array['CASHIER']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select o.id, o.table_session_id, m.number, o.daily_number::bigint, o.business_date,
      o.pago_en_caja_desde, (saldo.monto * 100)::bigint
    from public.orders o left join public.dining_tables m on m.id = o.dining_table_id and m.branch_id = o.branch_id
    cross join lateral (select private.us150_saldo_pedido(o) as monto) saldo
    where o.restaurant_id = p_restaurante and o.status = 'PENDING' and o.pago_en_caja_desde is not null
      and (p_pedido is null or o.id = p_pedido) and private.us150_limite_pago(o) > clock_timestamp()
      and private.us150_sesion_vigente(o) and not private.us150_pago_en_curso(o) and saldo.monto > 0
    order by o.pago_en_caja_desde, o.id;
end;
$$;

-- Cobro dirigido. Conserva el rol, el bloqueo por cuenta, el vuelto y la
-- idempotencia de la versión vigente de registrar_pago (US-106).
create function public.registrar_efectivo_pedido_caja(
  p_pedido_id uuid, p_sesion_id uuid, p_monto numeric, p_recibido numeric, p_clave uuid, p_receipt_email text default null
)
returns table (pago_id uuid, estado text, vuelto numeric)
language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v_user uuid := auth.uid();
  v_pedido public.orders%rowtype;
  v_pago public.payments%rowtype;
  v_saldo numeric;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_clave is null or p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2)
    or p_recibido is null or p_recibido <> round(p_recibido, 2) then raise exception 'INVALID_PAYMENT'; end if;
  if p_recibido < p_monto then raise exception 'INSUFFICIENT_CASH'; end if;

  select * into v_pedido from public.orders where id = p_pedido_id;
  if not found or v_pedido.table_session_id is distinct from p_sesion_id then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.has_role(v_pedido.restaurant_id, array['CASHIER']) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_pedido.table_session_id is not null then
    perform 1 from public.table_sessions s where s.id = v_pedido.table_session_id
      and s.restaurant_id = v_pedido.restaurant_id for update;
  end if;
  select * into v_pedido from public.orders where id = p_pedido_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_pago from public.payments p where p.created_by = v_user and p.idempotency_key = p_clave;
  if found then
    if v_pago.restaurant_id <> v_pedido.restaurant_id or v_pago.table_session_id is distinct from v_pedido.table_session_id
      or v_pago.method <> 'CASH' or v_pago.amount <> p_monto or v_pago.received_amount <> p_recibido
      or coalesce(v_pago.pedido_efectivo_id, v_pago.order_id) is distinct from p_pedido_id then
      raise exception 'INVALID_PAYMENT';
    end if;
    return query select v_pago.id, v_pago.status, v_pago.change_amount;
    return;
  end if;

  if v_pedido.source <> 'QR' or v_pedido.status <> 'PENDING' or v_pedido.pago_en_caja_desde is null
    or not private.us150_sesion_vigente(v_pedido) or private.us150_limite_pago(v_pedido) <= clock_timestamp() then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if private.us150_pago_en_curso(v_pedido) then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  v_saldo := private.us150_saldo_pedido(v_pedido);
  if v_saldo is null or v_saldo <= 0 then raise exception 'NOTHING_TO_PAY'; end if;
  if p_monto <> v_saldo then raise exception 'CASH_ORDER_BALANCE_CHANGED'; end if;

  insert into public.payments (restaurant_id, table_session_id, order_id, pedido_efectivo_id,
    method, status, amount, received_amount, change_amount, idempotency_key, created_by, confirmed_at, receipt_email)
  values (v_pedido.restaurant_id, v_pedido.table_session_id,
    case when v_pedido.table_session_id is null then p_pedido_id end,
    case when v_pedido.table_session_id is not null then p_pedido_id end,
    'CASH', 'CONFIRMED', p_monto, p_recibido, p_recibido - p_monto, p_clave, v_user, now(), nullif(trim(p_receipt_email), ''))
  returning * into v_pago;
  return query select v_pago.id, v_pago.status, v_pago.change_amount;
end;
$$;

-- Última versión de US-105. El vencimiento, el contador y US-149 comparten el plazo.
create or replace function public.vencer_pedidos_sin_pago(p_restaurante uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_candidato record; v_pedido public.orders%rowtype; v_cancelados integer := 0;
begin
  if p_restaurante is null then raise exception 'RESTAURANT_REQUIRED' using errcode = '22023'; end if;
  for v_candidato in
    select o.id, o.table_session_id from public.orders o
    where o.restaurant_id = p_restaurante and o.source = 'QR' and o.status = 'PENDING'
      and private.us150_limite_pago(o) <= clock_timestamp()
    order by coalesce(o.table_session_id, o.id), o.id
  loop
    if v_candidato.table_session_id is not null then
      perform 1 from public.table_sessions s where s.id = v_candidato.table_session_id
        and s.restaurant_id = p_restaurante for update;
    end if;
    select * into v_pedido from public.orders o where o.id = v_candidato.id
      and o.restaurant_id = p_restaurante and o.source = 'QR' and o.status = 'PENDING'
      and private.us150_limite_pago(o) <= clock_timestamp() for update;
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

-- Última versión de US-149. Usa el saldo individual y el plazo ampliado.
create or replace function private.us149_bloqueo_edicion(p_pedido public.orders)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  if p_pedido.status <> 'PENDING' then return 'INVALID_STATE'; end if;
  if p_pedido.table_session_id is not null and not exists (
    select 1 from public.table_sessions s where s.id = p_pedido.table_session_id
      and s.restaurant_id = p_pedido.restaurant_id and s.branch_id = p_pedido.branch_id
      and s.dining_table_id = p_pedido.dining_table_id and s.closed_at is null
  ) then
    return 'ACCOUNT_CLOSED';
  end if;

  v_saldo := private.us150_saldo_pedido(p_pedido);
  if v_saldo < p_pedido.total then return 'PAYMENT_CONFIRMED'; end if;

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
  if private.us150_limite_pago(p_pedido) <= clock_timestamp() then return 'ORDER_EXPIRED'; end if;
  return null;
end;
$$;

revoke all on function private.us150_limite_pago(public.orders) from public, anon, authenticated;
revoke all on function private.us150_saldos_pedidos_sesion(uuid) from public, anon, authenticated;
revoke all on function private.us150_saldo_pedido(public.orders) from public, anon, authenticated;
revoke all on function private.us150_pago_en_curso(public.orders) from public, anon, authenticated;
revoke all on function private.us150_sesion_vigente(public.orders) from public, anon, authenticated;
revoke all on function public.leer_pago_en_caja_cliente(text, uuid) from public, anon, authenticated;
revoke all on function public.elegir_pago_en_caja_cliente(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.listar_pedidos_pago_en_caja(uuid, uuid) from public, anon, authenticated;
revoke all on function public.registrar_efectivo_pedido_caja(uuid, uuid, numeric, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.leer_pago_en_caja_cliente(text, uuid) to service_role;
grant execute on function public.elegir_pago_en_caja_cliente(text, uuid, boolean) to service_role;
grant execute on function public.listar_pedidos_pago_en_caja(uuid, uuid) to authenticated;
grant execute on function public.registrar_efectivo_pedido_caja(uuid, uuid, numeric, numeric, uuid, text) to authenticated;

commit;
