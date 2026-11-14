-- US-088: reserva transaccional de boletas exclusivamente de prueba.
-- Alexander configura receipt_series después de comprobar el correlativo libre.
alter table public.payments add column receipt_email text
  check (receipt_email is null or (length(receipt_email) <= 254
    and receipt_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

create table public.receipt_series (
  restaurant_id uuid primary key references public.restaurants(id),
  series text not null check (series ~ '^B[A-Z0-9]{3}$'),
  next_number integer not null check (next_number between 1 and 100000000),
  is_test boolean not null default true check (is_test)
);
alter table public.receipt_series enable row level security;
revoke all on public.receipt_series from anon, authenticated;
grant all on public.receipt_series to service_role;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_session_id uuid references public.table_sessions(id),
  order_id uuid references public.orders(id),
  payment_id uuid not null unique references public.payments(id),
  series text not null check (series ~ '^B[A-Z0-9]{3}$'),
  number integer not null check (number between 1 and 99999999),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'EMITIDO', 'ERROR')),
  pdf_url text,
  xml_url text,
  is_test boolean not null default true check (is_test),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((table_session_id is null) <> (order_id is null)),
  check (status <> 'EMITIDO' or (pdf_url is not null and xml_url is not null)),
  check (pdf_url is null or (length(pdf_url) <= 2048 and pdf_url ~ '^https://[^[:space:]]+$')),
  check (xml_url is null or (length(xml_url) <= 2048 and xml_url ~ '^https://[^[:space:]]+$')),
  unique (restaurant_id, series, number)
);
create unique index receipts_session_unique on public.receipts(table_session_id) where table_session_id is not null;
create unique index receipts_order_unique on public.receipts(order_id) where order_id is not null;
alter table public.receipts enable row level security;
revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;
grant all on public.receipts to service_role;
create policy receipts_lectura on public.receipts for select to authenticated
  using ((select private.has_role(restaurant_id, array['CASHIER', 'OWNER', 'ADMIN'])));

-- El pago ya bloquea su cuenta. Esta función bloquea además la configuración:
-- dos cuentas distintas nunca reciben el mismo número. No reserva pagos parciales.
create function private.reservar_boleta_prueba() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_config public.receipt_series%rowtype;
  v_saldo numeric;
  v_total numeric;
begin
  if new.status <> 'CONFIRMED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'CONFIRMED' then return new; end if;
  v_saldo := case when new.table_session_id is not null
    then private.saldo_pendiente_sesion(new.table_session_id)
    else private.saldo_pendiente_pedido(new.order_id) end;
  if v_saldo <> 0 then return new; end if;
  select coalesce(sum(amount), 0) into v_total from public.payments
    where restaurant_id = new.restaurant_id and status = 'CONFIRMED'
      and ((new.table_session_id is not null and table_session_id = new.table_session_id)
        or (new.order_id is not null and order_id = new.order_id));
  -- Esta historia solo emite a VARIOS, por importes menores de S/ 700.
  if v_total <= 0 or v_total >= 700 then return new; end if;
  select * into v_config from public.receipt_series
    where restaurant_id = new.restaurant_id and is_test for update;
  -- Sin configurar la serie se conserva el cobro; no se inventan correlativos.
  if not found or v_config.next_number > 99999999 then return new; end if;
  if exists (select 1 from public.receipts where restaurant_id = new.restaurant_id
    and ((new.table_session_id is not null and table_session_id = new.table_session_id)
      or (new.order_id is not null and order_id = new.order_id))) then return new; end if;
  insert into public.receipts(restaurant_id, table_session_id, order_id, payment_id, series, number)
    values (new.restaurant_id, new.table_session_id, new.order_id, new.id, v_config.series, v_config.next_number);
  update public.receipt_series set next_number = next_number + 1 where restaurant_id = new.restaurant_id;
  return new;
end;
$$;
revoke all on function private.reservar_boleta_prueba() from public, anon, authenticated;
create trigger reservar_boleta_prueba after insert or update of status on public.payments
  for each row execute function private.reservar_boleta_prueba();

-- Solo servidor, después de autenticar el callback HMAC. Nunca crea números.
create function public.actualizar_boleta_prueba(
  p_pago_id uuid, p_serie text, p_numero integer, p_estado text,
  p_pdf text default null, p_xml text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_recibo public.receipts%rowtype;
begin
  if p_estado is null or p_estado not in ('EMITIDO', 'ERROR') then
    raise exception 'INVALID_RECEIPT' using errcode = '22023';
  end if;
  select r.* into v_recibo from public.receipts r join public.payments p on p.id = r.payment_id
    and p.restaurant_id = r.restaurant_id and p.status = 'CONFIRMED'
    where r.payment_id = p_pago_id and r.is_test for update of r;
  if not found then raise exception 'RECEIPT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_recibo.series is distinct from p_serie or v_recibo.number is distinct from p_numero then
    raise exception 'INVALID_RECEIPT' using errcode = '22023';
  end if;
  if v_recibo.status = 'EMITIDO' then
    if p_estado <> 'EMITIDO' or v_recibo.pdf_url is distinct from p_pdf or v_recibo.xml_url is distinct from p_xml then
      raise exception 'RECEIPT_CONFLICT' using errcode = '22023';
    end if;
    return v_recibo.id;
  end if;
  update public.receipts set status = p_estado,
    pdf_url = case when p_estado = 'EMITIDO' then p_pdf end,
    xml_url = case when p_estado = 'EMITIDO' then p_xml end, updated_at = now()
    where id = v_recibo.id;
  return v_recibo.id;
end;
$$;
revoke all on function public.actualizar_boleta_prueba(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.actualizar_boleta_prueba(uuid, text, integer, text, text, text) to service_role;


-- Sustituir firmas, sin sobrecargas ambiguas; se mantienen las reglas previas.
drop function public.registrar_pago(uuid, uuid, text, numeric, numeric, text, boolean, uuid);
create function public.registrar_pago(p_sesion_id  uuid,
  p_pedido_id  uuid,
  p_metodo     text,
  p_monto      numeric,
  p_recibido   numeric,
  p_referencia text,
  p_aprobado   boolean,
  p_clave      uuid,
  p_receipt_email text default null
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
$$;

revoke all on function public.registrar_pago(uuid, uuid, text, numeric, numeric, text, boolean, uuid, text) from public, anon;
grant execute on function public.registrar_pago(uuid, uuid, text, numeric, numeric, text, boolean, uuid, text) to authenticated;

drop function public.registrar_pago_stripe(text, text, uuid, uuid, numeric);
create function public.registrar_pago_stripe(p_stripe_session_id text,
  p_payment_intent    text,
  p_sesion_id         uuid,
  p_pedido_id         uuid,
  p_monto             numeric,
  p_receipt_email text default null
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
    reference, stripe_session_id, idempotency_key, created_by, confirmed_at, receipt_email
  ) values (
    v_restaurant, p_sesion_id, p_pedido_id, 'CARD', 'CONFIRMED', p_monto,
    p_payment_intent, p_stripe_session_id, gen_random_uuid(), null, now(), nullif(trim(p_receipt_email), '')
  )
  returning * into v_existente;

  return query select v_existente.id, false;
end;
$$;
revoke all on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.registrar_pago_stripe(text, text, uuid, uuid, numeric, text) to service_role;
