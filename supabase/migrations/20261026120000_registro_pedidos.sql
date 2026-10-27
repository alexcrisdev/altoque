-- US-009: registro atómico de pedidos y clave de idempotencia por QR.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid not null,
  qr_code_id uuid not null references public.qr_codes(id),
  table_session_id uuid references public.table_sessions(id),
  dining_table_id uuid,
  modality text not null check (modality in ('DINE_IN', 'TAKEAWAY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED')),
  total numeric(12,2) not null check (total > 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id),
  foreign key (dining_table_id, branch_id) references public.dining_tables(id, branch_id),
  check ((modality = 'DINE_IN' and dining_table_id is not null and table_session_id is not null)
      or (modality = 'TAKEAWAY' and dining_table_id is null and table_session_id is null)),
  unique (qr_code_id, idempotency_key)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price numeric(10,2) not null check (unit_price > 0),
  subtotal numeric(12,2) not null check (subtotal > 0),
  observation text check (observation is null or length(observation) <= 140)
);

create index orders_restaurant_created_at_idx on public.orders (restaurant_id, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy orders_read_member on public.orders
  for select to authenticated using ((select private.is_member(restaurant_id)));
create policy order_items_read_member on public.order_items
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_id and (select private.is_member(o.restaurant_id))
  ));

-- Solo el servidor con service role puede llamar esta función. En una única
-- transacción vuelve a validar QR, sesión, disponibilidad y precios vigentes.
create or replace function public.registrar_pedido_qr(
  p_qr_code_id uuid,
  p_idempotency_key uuid,
  p_items jsonb
) returns table (pedido_id uuid, numero_pedido bigint, repetido boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.qr_codes%rowtype;
  v_order public.orders%rowtype;
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

  if v_qr.purpose = 'DINE_IN' and not exists (
    select 1 from public.table_sessions s where s.dining_table_id = v_qr.dining_table_id
      and s.restaurant_id = v_qr.restaurant_id and s.branch_id = v_qr.branch_id and s.closed_at is null
    for share
  ) then raise exception 'TABLE_SESSION_CLOSED' using errcode = '23514'; end if;

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
    dining_table_id, modality, total, idempotency_key)
  values (v_qr.restaurant_id, v_qr.branch_id, v_qr.id,
    case when v_qr.purpose = 'DINE_IN' then (
      select s.id from public.table_sessions s where s.dining_table_id = v_qr.dining_table_id
        and s.closed_at is null limit 1 for share
    ) else null end,
    v_qr.dining_table_id, v_qr.purpose, v_total, p_idempotency_key)
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

revoke all on function public.registrar_pedido_qr(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pedido_qr(uuid, uuid, jsonb) to service_role;
