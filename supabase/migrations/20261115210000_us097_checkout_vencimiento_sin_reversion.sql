-- US-097: conservar los vencimientos confirmados aunque Checkout ya no tenga
-- una cuenta cobrable al terminar de vencer los pedidos antiguos.
begin;

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

  -- Mantener el orden de bloqueo global: vencimiento primero, cuenta después.
  perform public.vencer_pedidos_sin_pago(
    coalesce((select s.restaurant_id from public.table_sessions s where s.id = p_sesion_id),
      (select o.restaurant_id from public.orders o where o.id = p_pedido_id))
  );

  if p_sesion_id is not null then
    select s.restaurant_id into v_restaurant from public.table_sessions s
      where s.id = p_sesion_id and s.closed_at is null for update;
    -- La sesión pudo quedar sin pedidos cobrables después del vencimiento.
    -- No lanzar excepción: eso revertiría cancelación, historial y stock.
    if v_restaurant is null then return; end if;
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
    -- Un pedido vencido ya no es una cuenta cobrable, pero su vencimiento debe
    -- quedar confirmado antes de devolver un resultado vacío al servidor.
    if v_restaurant is null then return; end if;
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
  -- Una cuenta vacía produce cero filas; evita revertir vencimientos por
  -- NOTHING_TO_PAY mientras mantiene la firma tabular pública del RPC.
  if v_amount <= 0 or cardinality(v_ids) = 0 then return; end if;

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

commit;
