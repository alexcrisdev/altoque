-- US-076: pago con tarjeta online (Stripe Checkout, modo prueba).
-- El cliente paga en la página de Stripe; el pago solo se registra cuando llega
-- el webhook firmado. Esos pagos no los registra ningún usuario del restaurante.

alter table public.payments
  add column stripe_session_id text unique,            -- cs_test_... (sesión de Checkout)
  alter column created_by drop not null;

-- Un pago sin usuario solo puede ser un pago de Stripe, con tarjeta y confirmado.
alter table public.payments
  add constraint payments_registrador_check check (
    created_by is not null
    or (stripe_session_id is not null and method = 'CARD' and status = 'CONFIRMED')
  ),
  add constraint payments_stripe_check check (
    stripe_session_id is null
    or (method = 'CARD' and stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$')
  );

-- La referencia de un pago Stripe es su PaymentIntent (pi_...), que lleva guion bajo.
alter table public.payments drop constraint payments_referencia_check;
alter table public.payments
  add constraint payments_referencia_check check (
    (method = 'CASH' and reference is null)
    or (stripe_session_id is null and method <> 'CASH' and reference ~ '^[A-Za-z0-9-]{3,40}$')
    or (stripe_session_id is not null and reference ~ '^pi_[A-Za-z0-9]{8,64}$')
  );

-- Saldo de una cuenta abierta para crear la sesión de Checkout. Solo la usa el
-- servidor (service role): el monto nunca sale del navegador.
-- Devuelve null si la cuenta no existe, ya se cerró o el pedido se canceló.
create or replace function public.saldo_cuenta_online(p_sesion_id uuid, p_pedido_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (p_sesion_id is null) = (p_pedido_id is null) then return null; end if;
  if p_sesion_id is not null then
    if not exists (select 1 from public.table_sessions where id = p_sesion_id and closed_at is null) then
      return null;
    end if;
    return private.saldo_pendiente_sesion(p_sesion_id);
  end if;
  if not exists (
    select 1 from public.orders o
    where o.id = p_pedido_id and o.modality = 'TAKEAWAY' and o.status <> 'CANCELLED'
      and not exists (select 1 from public.account_closures c where c.order_id = o.id)
  ) then
    return null;
  end if;
  return private.saldo_pendiente_pedido(p_pedido_id);
end;
$$;

revoke all on function public.saldo_cuenta_online(uuid, uuid) from public, anon, authenticated;
grant execute on function public.saldo_cuenta_online(uuid, uuid) to service_role;

-- Registra el pago confirmado por Stripe. Solo la llama el webhook del servidor
-- (service role), después de verificar la firma del evento.
-- Si Stripe reenvía el mismo evento, devuelve el pago ya registrado (no duplica).
create or replace function public.registrar_pago_stripe(
  p_stripe_session_id text,
  p_payment_intent    text,
  p_sesion_id         uuid,
  p_pedido_id         uuid,
  p_monto             numeric
)
returns table (pago_id uuid, duplicado boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
  v_saldo      numeric;
  v_existente  public.payments%rowtype;
begin
  if p_stripe_session_id is null or p_payment_intent is null
     or ((p_sesion_id is null) = (p_pedido_id is null))
     or p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'INVALID_PAYMENT' using errcode = '22023';
  end if;

  -- Evento repetido: mismo checkout = mismo pago.
  select * into v_existente from public.payments where stripe_session_id = p_stripe_session_id;
  if found then
    return query select v_existente.id, true;
    return;
  end if;

  -- Bloquea la cuenta, igual que registrar_pago.
  if p_sesion_id is not null then
    select restaurant_id into v_restaurant from public.table_sessions
      where id = p_sesion_id and closed_at is null for update;
  else
    select restaurant_id into v_restaurant from public.orders
      where id = p_pedido_id and modality = 'TAKEAWAY' and status <> 'CANCELLED' for update;
  end if;
  if v_restaurant is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;

  -- Stripe ya cobró. Si la cuenta se pagó por otro medio mientras tanto, no se
  -- registra un pago de más: el webhook lo informa para devolver el dinero.
  v_saldo := case when p_sesion_id is not null
    then private.saldo_pendiente_sesion(p_sesion_id)
    else private.saldo_pendiente_pedido(p_pedido_id) end;
  if p_monto > v_saldo then raise exception 'AMOUNT_EXCEEDS_BALANCE' using errcode = '22023'; end if;

  insert into public.payments (
    restaurant_id, table_session_id, order_id, method, status, amount,
    reference, stripe_session_id, idempotency_key, created_by, confirmed_at
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, 'CARD', 'CONFIRMED', p_monto,
    p_payment_intent, p_stripe_session_id, gen_random_uuid(), null, now()
  )
  returning * into v_existente;

  return query select v_existente.id, false;
end;
$$;

revoke all on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric) to service_role;
