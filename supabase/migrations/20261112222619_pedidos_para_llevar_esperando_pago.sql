-- US-085: los pedidos QR para llevar esperan el pago antes de entrar a cocina.
-- No modifica las funciones de registro ni los pedidos existentes.

begin;

-- BEFORE INSERT permite que el historial inicial existente registre PENDING.
create function private.us085_establecer_espera_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.modality = 'TAKEAWAY' and new.source = 'QR' then
    new.status := 'PENDING';
  end if;

  return new;
end;
$$;

create trigger orders_us085_esperar_pago
  before insert on public.orders
  for each row
  execute function private.us085_establecer_espera_pago();

-- Se ejecuta tanto al insertar un pago confirmado como al confirmar un Yape.
-- Las funciones de pago existentes siguen validando permisos, montos e idempotencia.
create function private.us085_iniciar_preparacion_al_pagar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.orders%rowtype;
begin
  -- Un pago que ya estaba confirmado no debe generar otra transición.
  if tg_op = 'UPDATE' then
    if old.status = 'CONFIRMED' then
      return new;
    end if;
  end if;

  -- Usamos el mismo bloqueo de pedido que las funciones de cobro.
  select *
    into v_pedido
    from public.orders
    where id = new.order_id
      and restaurant_id = new.restaurant_id
    for update;

  if not found then
    return new;
  end if;

  -- Solo afecta a pedidos QR para llevar que todavía esperan pago.
  if v_pedido.modality <> 'TAKEAWAY'
     or v_pedido.source <> 'QR'
     or v_pedido.status <> 'PENDING' then
    return new;
  end if;

  -- El pago de este trigger ya está registrado.
  -- Los pagos pendientes o fallidos no reducen el saldo.
  if private.saldo_pendiente_pedido(v_pedido.id) <> 0 then
    return new;
  end if;

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
    'US-085: pago confirmado',
    clock_timestamp()
  );

  return new;
end;
$$;

create trigger payments_us085_iniciar_preparacion
  after insert or update of status on public.payments
  for each row
  when (
    new.order_id is not null
    and new.status = 'CONFIRMED'
  )
  execute function private.us085_iniciar_preparacion_al_pagar();

-- Estas funciones se ejecutan mediante triggers, no mediante RPC del cliente.
revoke all on function private.us085_establecer_espera_pago()
  from public, anon, authenticated, service_role;

revoke all on function private.us085_iniciar_preparacion_al_pagar()
  from public, anon, authenticated, service_role;

commit;