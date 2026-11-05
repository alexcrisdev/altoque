-- US-022 (efectivo), y deja lista la base para US-023 (Yape) y US-024 (tarjeta).
-- AlToque no procesa dinero: registra pagos hechos por fuera (billetes, app de
-- Yape del restaurante, terminal POS). Nunca se guardan datos de tarjeta.

alter table public.payments
  add column received_amount numeric(12,2),           -- efectivo: lo que entregó el cliente
  add column change_amount   numeric(12,2),           -- efectivo: vuelto
  add column reference       text,                    -- Yape: n.º de operación / POS: referencia del voucher
  add column verified_by     uuid references public.users(id),
  add column verified_at     timestamptz,
  add constraint payments_efectivo_check check (
    (method = 'CASH') = (received_amount is not null)
    and (received_amount is null or (received_amount >= amount and change_amount = received_amount - amount))
  ),
  add constraint payments_referencia_check check (
    (method = 'CASH' and reference is null)
    or (method <> 'CASH' and reference ~ '^[A-Za-z0-9-]{3,40}$')
  ),
  add constraint payments_verificacion_check check ((verified_by is null) = (verified_at is null));

-- Saldo de un pedido para llevar (la cuenta es el propio pedido).
create or replace function private.saldo_pendiente_pedido(p_pedido_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(oi.unit_price * oi.quantity)
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        where o.id = p_pedido_id and o.status <> 'CANCELLED'
    ), 0)
    - coalesce((
      select sum(p.amount)
        from public.payments p
        where p.order_id = p_pedido_id and p.status = 'CONFIRMED'
    ), 0);
$$;

revoke all on function private.saldo_pendiente_pedido(uuid) from public, anon, authenticated;

-- Registra un pago de una mesa (p_sesion_id) o de un pedido para llevar (p_pedido_id).
--   CASH: p_recibido obligatorio y >= monto; queda CONFIRMED y calcula el vuelto.
--   YAPE: p_referencia obligatoria; queda PENDING hasta que alguien verifique (verificar_pago).
--   CARD: p_referencia y p_aprobado obligatorios; CONFIRMED si aprobado, FAILED si rechazado.
-- Reintento con la misma p_clave del mismo usuario: devuelve el pago ya creado.
create or replace function public.registrar_pago(
  p_sesion_id  uuid,
  p_pedido_id  uuid,
  p_metodo     text,
  p_monto      numeric,
  p_recibido   numeric,
  p_referencia text,
  p_aprobado   boolean,
  p_clave      uuid
)
returns table (pago_id uuid, estado text, vuelto numeric)
language plpgsql
security definer
set search_path = ''
as $$
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
  if not (select private.has_role(v_restaurant, array['CASHIER', 'WAITER', 'OWNER', 'ADMIN'])) then
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
    received_amount, change_amount, reference, idempotency_key, created_by, confirmed_at
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, p_metodo, v_estado, p_monto,
    case when p_metodo = 'CASH' then p_recibido end,
    case when p_metodo = 'CASH' then p_recibido - p_monto end,
    v_referencia, p_clave, v_user,
    case when v_estado = 'CONFIRMED' then now() end
  )
  returning * into v_existente;

  return query select v_existente.id, v_existente.status, v_existente.change_amount;
end;
$$;

-- Verificación de un pago Yape: un usuario autorizado confirma que el dinero
-- llegó (CONFIRMED) o lo rechaza (FAILED). Queda quién y cuándo.
create or replace function public.verificar_pago(p_pago_id uuid, p_confirmar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.registrar_pago(uuid, uuid, text, numeric, numeric, text, boolean, uuid) from public, anon;
revoke all on function public.verificar_pago(uuid, boolean) from public, anon;
grant execute on function public.registrar_pago(uuid, uuid, text, numeric, numeric, text, boolean, uuid) to authenticated;
grant execute on function public.verificar_pago(uuid, boolean) to authenticated;
