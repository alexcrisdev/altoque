-- US-097: vence pedidos QR sin pago y limita los pendientes por QR.
begin;

create or replace function public.vencer_pedidos_sin_pago(p_restaurante uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidato record;
  v_pedido public.orders%rowtype;
  v_cancelados integer := 0;
begin
  if p_restaurante is null then
    raise exception 'RESTAURANT_REQUIRED' using errcode = '22023';
  end if;

  -- Pagos de mesa bloquean primero la sesión y luego sus pedidos. Mantener ese
  -- orden evita carreras y deadlocks con registrar_pago y Stripe.
  for v_candidato in
    select o.id, o.table_session_id
      from public.orders o
      where o.restaurant_id = p_restaurante
        and o.source = 'QR'
        and o.status = 'PENDING'
        and o.created_at <= clock_timestamp() - interval '15 minutes'
      order by coalesce(o.table_session_id, o.id), o.id
  loop
    if v_candidato.table_session_id is not null then
      perform 1 from public.table_sessions s
        where s.id = v_candidato.table_session_id
          and s.restaurant_id = p_restaurante
        for update;
    end if;

    select * into v_pedido
      from public.orders o
      where o.id = v_candidato.id
        and o.restaurant_id = p_restaurante
        and o.source = 'QR'
        and o.status = 'PENDING'
        and o.created_at <= clock_timestamp() - interval '15 minutes'
      for update;
    if not found then continue; end if;

    -- TAKEAWAY paga contra el pedido; DINE_IN paga contra la sesión.
    if exists (
      select 1 from public.payments p
        where p.restaurant_id = p_restaurante
          and p.status = 'PENDING'
          and (p.order_id = v_pedido.id
            or (v_pedido.table_session_id is not null and p.table_session_id = v_pedido.table_session_id))
    ) then
      continue;
    end if;

    update public.orders set status = 'CANCELLED'
      where id = v_pedido.id and restaurant_id = p_restaurante and status = 'PENDING';
    if found then
      -- La actualización y el trigger de devolución de stock son atómicos con
      -- este historial: cualquier error revierte ambas operaciones.
      insert into public.order_status_history (
        order_id, restaurant_id, from_status, to_status, changed_by, reason
      ) values (
        v_pedido.id, p_restaurante, 'PENDING', 'CANCELLED', null, 'Vencido sin pago'
      );
      v_cancelados := v_cancelados + 1;
    end if;
  end loop;
  return v_cancelados;
end;
$$;

revoke all on function public.vencer_pedidos_sin_pago(uuid) from public, anon, authenticated;
grant execute on function public.vencer_pedidos_sin_pago(uuid) to service_role;

create or replace function private.us097_limitar_pedidos_pendientes_qr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendientes integer;
begin
  if new.source <> 'QR' then return new; end if;

  -- Serializa envíos del mismo QR. La función de expiración y el conteo quedan
  -- dentro de la transacción que inserta el pedido.
  perform pg_advisory_xact_lock(hashtextextended(new.qr_code_id::text, 0));
  perform public.vencer_pedidos_sin_pago(new.restaurant_id);

  if new.status = 'PENDING' then
    select count(*) into v_pendientes
      from public.orders o
      where o.restaurant_id = new.restaurant_id
        and o.qr_code_id = new.qr_code_id
        and o.source = 'QR'
        and o.status = 'PENDING';
    if v_pendientes >= 2 and not exists (
      select 1 from public.orders o
        where o.restaurant_id = new.restaurant_id
          and o.qr_code_id = new.qr_code_id
          and o.idempotency_key = new.idempotency_key
    ) then
      raise exception 'QR_PENDING_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_us097_limitar_pendientes_qr
  before insert on public.orders
  for each row execute function private.us097_limitar_pedidos_pendientes_qr();

revoke all on function private.us097_limitar_pedidos_pendientes_qr()
  from public, anon, authenticated, service_role;

commit;
