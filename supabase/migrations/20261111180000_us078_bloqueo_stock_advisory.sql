-- US-067/US-078: un mismo bloqueo por restaurante, producto y fecha protege
-- tanto el primer registro diario como la reserva de unidades al crear pedidos.
create or replace function public.bloquear_stock_diario(
  p_restaurant_id uuid,
  p_product_id uuid,
  p_stock_date date
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_restaurant_id::text || ':' || p_product_id::text || ':' ||
      (p_stock_date - date '2000-01-01')::text,
    0
  ));
end;
$$;

revoke all on function public.bloquear_stock_diario(uuid, uuid, date)
  from public, anon, authenticated;

-- Bloquea todos los productos participantes en orden UUID estable.
create or replace function public.bloquear_stock_items(
  p_restaurant_id uuid,
  p_stock_date date,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select distinct (i.value->>'productoId')::uuid
      from jsonb_array_elements(p_items) i(value)
      order by 1
  loop
    perform public.bloquear_stock_diario(p_restaurant_id, v_product_id, p_stock_date);
  end loop;
end;
$$;

revoke all on function public.bloquear_stock_items(uuid, date, jsonb)
  from public, anon, authenticated;

-- Las escrituras autenticadas pasan por guardar_stock_diario, que comprueba rol
-- y bloquea el conjunto completo antes de tocar las filas.
revoke insert, update, delete on public.product_daily_stock from authenticated;
grant select on public.product_daily_stock to authenticated;

create or replace function public.guardar_stock_diario(
  p_restaurant_id uuid,
  p_stock_date date,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_limitados integer;
  v_afectados integer;
begin
  if not private.has_role(p_restaurant_id, array['OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_stock_date is null or p_stock_date <> (now() at time zone 'America/Lima')::date
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_STOCK' using errcode = '22023';
  end if;

  select count(*)::integer into v_total from jsonb_array_elements(p_items);
  if exists (
    select 1 from jsonb_array_elements(p_items) i(value)
    where (i.value->>'productoId') is null
      or (i.value->>'productoId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (i.value->>'cantidad') is not null and (i.value->>'cantidad') !~ '^(0|[1-9][0-9]*)$'
  ) or (select count(distinct i.value->>'productoId') from jsonb_array_elements(p_items) i(value)) <> v_total then
    raise exception 'INVALID_STOCK' using errcode = '22023';
  end if;

  if v_total <> (select count(*)::integer from public.products p
      where p.restaurant_id = p_restaurant_id and p.active)
    or exists (
      select 1 from jsonb_array_elements(p_items) i(value)
      left join public.products p on p.id = (i.value->>'productoId')::uuid
        and p.restaurant_id = p_restaurant_id and p.active
      where p.id is null
    ) then
    raise exception 'INVALID_PRODUCT' using errcode = '23514';
  end if;

  -- Bloquear antes de consultar vendidos, borrar o insertar stock.
  perform public.bloquear_stock_items(p_restaurant_id, p_stock_date, p_items);

  if exists (
    select 1
    from public.product_daily_stock s
    join jsonb_array_elements(p_items) i(value)
      on s.product_id = (i.value->>'productoId')::uuid
    where s.restaurant_id = p_restaurant_id and s.stock_date = p_stock_date
      and i.value->>'cantidad' is null and s.sold > 0
  ) then
    raise exception 'STOCK_ALREADY_SOLD' using errcode = '23514';
  end if;

  delete from public.product_daily_stock s
    using jsonb_array_elements(p_items) i(value)
    where s.restaurant_id = p_restaurant_id and s.stock_date = p_stock_date
      and s.product_id = (i.value->>'productoId')::uuid and i.value->>'cantidad' is null;

  select count(*)::integer into v_limitados from jsonb_array_elements(p_items) i(value)
    where i.value->>'cantidad' is not null;
  insert into public.product_daily_stock (restaurant_id, product_id, stock_date, quantity)
    select p_restaurant_id, (i.value->>'productoId')::uuid, p_stock_date, (i.value->>'cantidad')::integer
    from jsonb_array_elements(p_items) i(value)
    where i.value->>'cantidad' is not null
    order by (i.value->>'productoId')::uuid
    on conflict (restaurant_id, product_id, stock_date) do update
      set quantity = excluded.quantity
      where product_daily_stock.sold <= excluded.quantity;
  get diagnostics v_afectados = row_count;
  if v_afectados <> v_limitados then
    raise exception 'STOCK_BELOW_SOLD' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.guardar_stock_diario(uuid, date, jsonb) from public, anon;
grant execute on function public.guardar_stock_diario(uuid, date, jsonb) to authenticated;

create or replace function public.ajustar_stock_diario_pedido(
  p_restaurant_id uuid,
  p_product_id uuid,
  p_stock_date date,
  p_delta integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock public.product_daily_stock%rowtype;
  v_disponibles integer;
begin
  -- La consulta se ejecuta solo después de obtener el mismo bloqueo que US-067.
  perform public.bloquear_stock_diario(p_restaurant_id, p_product_id, p_stock_date);
  if p_delta = 0 then return false; end if;

  select * into v_stock
    from public.product_daily_stock
    where restaurant_id = p_restaurant_id
      and product_id = p_product_id
      and stock_date = p_stock_date
    for update;
  if not found then return false; end if;

  if p_delta > 0 then
    v_disponibles := v_stock.quantity - v_stock.sold;
    if v_disponibles < p_delta then
      raise exception 'STOCK_INSUFFICIENT:%:%', p_product_id, v_disponibles
        using errcode = '23514';
    end if;
    update public.product_daily_stock set sold = sold + p_delta where id = v_stock.id;
  else
    update public.product_daily_stock set sold = greatest(0, sold + p_delta) where id = v_stock.id;
  end if;
  return true;
end;
$$;

revoke all on function public.ajustar_stock_diario_pedido(uuid, uuid, date, integer)
  from public, anon, authenticated;

-- Los wrappers retienen todas las claves de los productos antes de que la
-- función existente cree order_items. El registro original conserva su lógica.
alter function public.registrar_pedido_qr(uuid, uuid, jsonb)
  rename to registrar_pedido_qr_sin_bloqueo_stock;
revoke all on function public.registrar_pedido_qr_sin_bloqueo_stock(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.registrar_pedido_qr(
  p_qr_code_id uuid,
  p_idempotency_key uuid,
  p_items jsonb
) returns table (pedido_id uuid, numero_pedido bigint, repetido boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  select q.restaurant_id into v_restaurant_id from public.qr_codes q where q.id = p_qr_code_id;
  perform public.bloquear_stock_items(
    v_restaurant_id, (now() at time zone 'America/Lima')::date, p_items
  );
  return query select * from public.registrar_pedido_qr_sin_bloqueo_stock(
    p_qr_code_id, p_idempotency_key, p_items
  );
end;
$$;
revoke all on function public.registrar_pedido_qr(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pedido_qr(uuid, uuid, jsonb) to service_role;

alter function public.registrar_pedido_cliente(uuid, uuid, jsonb, text, text, text)
  rename to registrar_pedido_cliente_sin_bloqueo_stock;
revoke all on function public.registrar_pedido_cliente_sin_bloqueo_stock(uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated, service_role;

create function public.registrar_pedido_cliente(
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
  v_restaurant_id uuid;
begin
  select q.restaurant_id into v_restaurant_id from public.qr_codes q where q.id = p_qr_code_id;
  perform public.bloquear_stock_items(
    v_restaurant_id, (now() at time zone 'America/Lima')::date, p_items
  );
  return query select * from public.registrar_pedido_cliente_sin_bloqueo_stock(
    p_qr_code_id, p_idempotency_key, p_items, p_modality, p_customer_name, p_customer_phone
  );
end;
$$;
revoke all on function public.registrar_pedido_cliente(uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.registrar_pedido_cliente(uuid, uuid, jsonb, text, text, text)
  to service_role;

alter function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb)
  rename to registrar_pedido_mesero_sin_bloqueo_stock;
revoke all on function public.registrar_pedido_mesero_sin_bloqueo_stock(uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, service_role;

create function public.registrar_pedido_mesero(
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
begin
  if not private.has_role(p_restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.bloquear_stock_items(
    p_restaurant_id, (now() at time zone 'America/Lima')::date, p_items
  );
  return query select * from public.registrar_pedido_mesero_sin_bloqueo_stock(
    p_restaurant_id, p_modality, p_dining_table_id, p_branch_id, p_idempotency_key, p_items
  );
end;
$$;
revoke all on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb)
  to authenticated;

alter function public.modificar_pedido(uuid, jsonb, text)
  rename to modificar_pedido_sin_bloqueo_stock;
revoke all on function public.modificar_pedido_sin_bloqueo_stock(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.modificar_pedido(
  p_pedido_id uuid,
  p_cambios jsonb,
  p_motivo text default null
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_product_id uuid;
  v_restaurant_id uuid;
begin
  select o.restaurant_id into v_restaurant_id from public.orders o where o.id = p_pedido_id;
  if not found then
    return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
  end if;
  if not private.has_role(v_restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_pedido_id for update;
  if not found then
    return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
  end if;

  -- Bloquear todos los artículos aunque solo cambie uno, siempre en orden.
  for v_product_id in
    select product_ids.product_id
    from (
      select oi.product_id
        from public.order_items oi
        where oi.order_id = v_order.id
      union
      select changed.product_id
        from jsonb_array_elements(
          case when jsonb_typeof(p_cambios) = 'array' then p_cambios else '[]'::jsonb end
        ) change(value)
        join public.order_items changed
          on changed.id = case
            when change.value->>'itemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (change.value->>'itemId')::uuid
            else null
          end
          and changed.order_id = v_order.id
    ) product_ids
    order by product_ids.product_id
  loop
    perform public.bloquear_stock_diario(
      v_order.restaurant_id, v_product_id, (v_order.created_at at time zone 'America/Lima')::date
    );
  end loop;

  return public.modificar_pedido_sin_bloqueo_stock(p_pedido_id, p_cambios, p_motivo);
end;
$$;
revoke all on function public.modificar_pedido(uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.modificar_pedido(uuid, jsonb, text) to authenticated;
