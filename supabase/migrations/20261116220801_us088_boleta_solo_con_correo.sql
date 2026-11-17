-- US-088: solo reserva si la cuenta tiene correo en un pago confirmado.
-- No modifica reservas anteriores, correlativos, triggers ni otras funciones.
create or replace function private.reservar_boleta_prueba() returns trigger
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
  if not exists (select 1 from public.payments
    where restaurant_id = new.restaurant_id and status = 'CONFIRMED'
      and nullif(trim(receipt_email), '') is not null
      and ((new.table_session_id is not null and table_session_id = new.table_session_id)
        or (new.order_id is not null and order_id = new.order_id))) then
    return new;
  end if;
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
