-- US-094: pedidos QR de mesa esperan el pago total de la sesión antes de cocina.

begin;

alter table public.restaurants
  add column prepay_dine_in boolean not null default false;

-- US-085: conservar la espera de pedidos para llevar y activarla para pedidos
-- QR en mesa solo cuando el restaurante habilita el cobro anticipado.
create or replace function private.us085_establecer_espera_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cobro_anticipado boolean := false;
begin
  if new.modality = 'TAKEAWAY' and new.source = 'QR' then
    new.status := 'PENDING';
  elsif new.modality = 'DINE_IN' and new.source = 'QR' then
    select r.prepay_dine_in into v_cobro_anticipado
      from public.restaurants r
      where r.id = new.restaurant_id;
    if coalesce(v_cobro_anticipado, false) then
      new.status := 'PENDING';
    end if;
  end if;

  return new;
end;
$$;

-- La función de US-085 solo se ejecuta desde el trigger.
revoke all on function private.us085_establecer_espera_pago()
  from public, anon, authenticated, service_role;

-- Los pagos de mesa se asocian a la sesión (order_id es NULL). La función de
-- registro de pagos ya bloquea esa sesión; el bloqueo aquí también cubre Stripe
-- y mantiene en fila los cambios de estado de los pedidos de esa cuenta.
create function private.us094_iniciar_preparacion_al_pagar_sesion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.orders%rowtype;
begin
  if tg_op = 'UPDATE' and old.status = 'CONFIRMED' then
    return new;
  end if;

  perform 1
    from public.table_sessions
    where id = new.table_session_id
      and restaurant_id = new.restaurant_id
    for update;
  if not found then
    return new;
  end if;

  if private.saldo_pendiente_sesion(new.table_session_id) <> 0 then
    return new;
  end if;

  for v_pedido in
    select *
      from public.orders
      where table_session_id = new.table_session_id
        and restaurant_id = new.restaurant_id
        and status = 'PENDING'
      order by id
      for update
  loop
    update public.orders
      set status = 'IN_PROGRESS'
      where id = v_pedido.id;

    insert into public.order_status_history (
      order_id,
      restaurant_id,
      from_status,
      to_status,
      changed_by,
      reason,
      created_at
    ) values (
      v_pedido.id,
      v_pedido.restaurant_id,
      'PENDING',
      'IN_PROGRESS',
      coalesce(new.verified_by, new.created_by),
      'US-094: pago confirmado',
      clock_timestamp()
    );
  end loop;

  return new;
end;
$$;

create trigger payments_us094_iniciar_preparacion_sesion
  after insert or update of status on public.payments
  for each row
  when (
    new.table_session_id is not null
    and new.status = 'CONFIRMED'
  )
  execute function private.us094_iniciar_preparacion_al_pagar_sesion();

revoke all on function private.us094_iniciar_preparacion_al_pagar_sesion()
  from public, anon, authenticated, service_role;

commit;
