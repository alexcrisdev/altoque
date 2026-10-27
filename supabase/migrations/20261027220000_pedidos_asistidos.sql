-- US-003: pedidos asistidos. El mesero registra el pedido de un cliente sin QR.

-- Un pedido asistido no tiene QR; en su lugar guarda quién lo registró.
alter table public.orders alter column qr_code_id drop not null;

alter table public.orders
  add column source text not null default 'QR' check (source in ('QR', 'WAITER')),
  add column created_by uuid references public.users(id);

-- QR: viene de un código y no tiene autor. WAITER: sin código y con autor.
alter table public.orders add constraint orders_source_consistency check (
  (source = 'QR' and qr_code_id is not null and created_by is null) or
  (source = 'WAITER' and qr_code_id is null and created_by is not null)
);

-- Idempotencia del mesero: la misma clave del mismo mesero es el mismo pedido.
create unique index orders_waiter_idempotency
  on public.orders (created_by, idempotency_key)
  where source = 'WAITER';

-- Se ejecuta con la sesión del mesero: auth.uid() es quien registra y no se
-- puede suplantar. En una sola transacción vuelve a validar rol, mesa o local,
-- sesión abierta, disponibilidad y precios vigentes.
create or replace function public.registrar_pedido_mesero(
  p_restaurant_id uuid,
  p_modality text,
  p_dining_table_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_items jsonb
) returns table (pedido_id uuid, numero_pedido bigint, repetido boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_branch uuid;
  v_session uuid;
  v_order public.orders%rowtype;
  v_total numeric(12,2);
  v_count integer;
begin
  if v_user is null
    or not private.has_role(p_restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders
    where source = 'WAITER' and created_by = v_user and idempotency_key = p_idempotency_key;
  if found then
    return query select v_order.id, v_order.order_number, true;
    return;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;

  if p_modality = 'DINE_IN' then
    select dt.branch_id into v_branch
      from public.dining_tables dt
      join public.branches b on b.id = dt.branch_id and b.restaurant_id = dt.restaurant_id
      join public.restaurants r on r.id = dt.restaurant_id
      where dt.id = p_dining_table_id and dt.restaurant_id = p_restaurant_id
        and dt.active and b.active and r.active
      for share of dt;
    if not found then raise exception 'TABLE_UNAVAILABLE' using errcode = '23514'; end if;

    select s.id into v_session from public.table_sessions s
      where s.dining_table_id = p_dining_table_id and s.closed_at is null
      for share;
    if not found then raise exception 'TABLE_SESSION_CLOSED' using errcode = '23514'; end if;
  elsif p_modality = 'TAKEAWAY' and p_dining_table_id is null then
    select b.id into v_branch
      from public.branches b
      join public.restaurants r on r.id = b.restaurant_id
      where b.id = p_branch_id and b.restaurant_id = p_restaurant_id and b.active and r.active
      for share of b;
    if not found then raise exception 'BRANCH_UNAVAILABLE' using errcode = '23514'; end if;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  -- Mantener precio y disponibilidad estables hasta insertar las líneas.
  perform p.id
    from public.products p
    join jsonb_array_elements(p_items) i(value) on p.id = (i.value->>'productoId')::uuid
    where p.restaurant_id = p_restaurant_id
    order by p.id
    for share of p;

  select count(*), coalesce(sum(p.price * (i.value->>'cantidad')::integer), 0)
    into v_count, v_total
    from jsonb_array_elements(p_items) i(value)
    join public.products p on p.id = (i.value->>'productoId')::uuid
      and p.restaurant_id = p_restaurant_id and p.active and p.available
    where (i.value->>'cantidad') ~ '^[1-9][0-9]*$'
      and (i.value->>'cantidad')::integer between 1 and 20;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = '23514';
  end if;

  insert into public.orders (restaurant_id, branch_id, qr_code_id, table_session_id,
    dining_table_id, modality, total, idempotency_key, source, created_by)
  values (p_restaurant_id, v_branch, null, v_session,
    case when p_modality = 'DINE_IN' then p_dining_table_id else null end,
    p_modality, v_total, p_idempotency_key, 'WAITER', v_user)
  on conflict (created_by, idempotency_key) where source = 'WAITER' do nothing
  returning * into v_order;

  if v_order.id is null then
    select * into v_order from public.orders
      where source = 'WAITER' and created_by = v_user and idempotency_key = p_idempotency_key;
    return query select v_order.id, v_order.order_number, true;
    return;
  end if;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, observation)
  select v_order.id, p.id, p.name, (i.value->>'cantidad')::integer, p.price,
    p.price * (i.value->>'cantidad')::integer, nullif(left(trim(i.value->>'observacion'), 140), '')
    from jsonb_array_elements(p_items) i(value)
    join public.products p on p.id = (i.value->>'productoId')::uuid
      and p.restaurant_id = p_restaurant_id and p.active and p.available;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = '23514';
  end if;
  return query select v_order.id, v_order.order_number, false;
end;
$$;

revoke all on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb) to authenticated;
