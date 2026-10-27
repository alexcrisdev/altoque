-- US-002: el cliente elige la modalidad (en el local o para llevar) y, si es
-- para llevar, deja los datos mínimos que pide el restaurante.

-- Qué datos pide cada restaurante en los pedidos para llevar.
alter table public.restaurants
  add column takeaway_requires_name boolean not null default true,
  add column takeaway_requires_phone boolean not null default false;

-- Datos mínimos del cliente. Solo existen en pedidos para llevar.
alter table public.orders
  add column customer_name text
    check (customer_name is null or length(trim(customer_name)) between 2 and 60),
  add column customer_phone text
    check (customer_phone is null or customer_phone ~ '^\+?[0-9]{7,15}$');

alter table public.orders add constraint orders_customer_only_takeaway check (
  modality = 'TAKEAWAY' or (customer_name is null and customer_phone is null)
);

-- Igual que registrar_pedido_qr (US-009), pero la modalidad la elige el cliente:
-- - QR de mesa: puede ser DINE_IN (conserva la mesa) o TAKEAWAY (sin mesa).
-- - QR de mostrador: solo TAKEAWAY.
-- La función anterior se mantiene para no romper la versión desplegada.
create or replace function public.registrar_pedido_cliente(
  p_qr_code_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_modality text,
  p_customer_name text,
  p_customer_phone text
) returns table (pedido_id uuid, numero_pedido bigint, repetido boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.qr_codes%rowtype;
  v_order public.orders%rowtype;
  v_session uuid;
  v_requires_name boolean;
  v_requires_phone boolean;
  v_name text := nullif(trim(p_customer_name), '');
  v_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '[[:space:]-]', '', 'g'), '');
  v_total numeric(12,2);
  v_count integer;
begin
  select * into v_order from public.orders
    where qr_code_id = p_qr_code_id and idempotency_key = p_idempotency_key;
  if found then
    return query select v_order.id, v_order.order_number, true;
    return;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;

  select q.* into v_qr from public.qr_codes q
    join public.branches b on b.id = q.branch_id and b.restaurant_id = q.restaurant_id
    join public.restaurants r on r.id = q.restaurant_id
    left join public.dining_tables dt on dt.id = q.dining_table_id and dt.branch_id = q.branch_id
    where q.id = p_qr_code_id and q.active and b.active and r.active
      and (q.purpose = 'TAKEAWAY' or (dt.active and q.dining_table_id is not null))
    for share of q;
  if not found then raise exception 'QR_UNAVAILABLE' using errcode = '23514'; end if;

  if p_modality is null or p_modality not in ('DINE_IN', 'TAKEAWAY')
    or (v_qr.purpose = 'TAKEAWAY' and p_modality = 'DINE_IN') then
    raise exception 'INVALID_MODALITY' using errcode = '22023';
  end if;

  -- Desde una mesa, siempre hace falta la sesión abierta (el mesero habilita).
  if v_qr.purpose = 'DINE_IN' then
    select s.id into v_session from public.table_sessions s
      where s.dining_table_id = v_qr.dining_table_id and s.restaurant_id = v_qr.restaurant_id
        and s.branch_id = v_qr.branch_id and s.closed_at is null
      for share;
    if not found then raise exception 'TABLE_SESSION_CLOSED' using errcode = '23514'; end if;
  end if;

  if p_modality = 'TAKEAWAY' then
    select r.takeaway_requires_name, r.takeaway_requires_phone
      into v_requires_name, v_requires_phone
      from public.restaurants r where r.id = v_qr.restaurant_id;
    if (v_requires_name and v_name is null) or (v_requires_phone and v_phone is null) then
      raise exception 'CUSTOMER_DATA_REQUIRED' using errcode = '23514';
    end if;
  else
    v_name := null;
    v_phone := null;
  end if;

  -- Mantener precio y disponibilidad estables hasta insertar las líneas.
  perform p.id
    from public.products p
    join jsonb_array_elements(p_items) i(value) on p.id = (i.value->>'productoId')::uuid
    where p.restaurant_id = v_qr.restaurant_id
    order by p.id
    for share of p;

  select count(*), coalesce(sum(p.price * (i.value->>'cantidad')::integer), 0)
    into v_count, v_total
    from jsonb_array_elements(p_items) i(value)
    join public.products p on p.id = (i.value->>'productoId')::uuid
      and p.restaurant_id = v_qr.restaurant_id and p.active and p.available
    where (i.value->>'cantidad') ~ '^[1-9][0-9]*$'
      and (i.value->>'cantidad')::integer between 1 and 20;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = '23514';
  end if;

  insert into public.orders (restaurant_id, branch_id, qr_code_id, table_session_id,
    dining_table_id, modality, total, idempotency_key, customer_name, customer_phone)
  values (v_qr.restaurant_id, v_qr.branch_id, v_qr.id,
    case when p_modality = 'DINE_IN' then v_session else null end,
    case when p_modality = 'DINE_IN' then v_qr.dining_table_id else null end,
    p_modality, v_total, p_idempotency_key, v_name, v_phone)
  on conflict (qr_code_id, idempotency_key) do nothing
  returning * into v_order;

  if v_order.id is null then
    select * into v_order from public.orders
      where qr_code_id = p_qr_code_id and idempotency_key = p_idempotency_key;
    return query select v_order.id, v_order.order_number, true;
    return;
  end if;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, observation)
  select v_order.id, p.id, p.name, (i.value->>'cantidad')::integer, p.price,
    p.price * (i.value->>'cantidad')::integer, nullif(left(trim(i.value->>'observacion'), 140), '')
    from jsonb_array_elements(p_items) i(value)
    join public.products p on p.id = (i.value->>'productoId')::uuid
      and p.restaurant_id = v_qr.restaurant_id and p.active and p.available;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = '23514';
  end if;
  return query select v_order.id, v_order.order_number, false;
end;
$$;

revoke all on function public.registrar_pedido_cliente(uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_pedido_cliente(uuid, uuid, jsonb, text, text, text)
  to service_role;
