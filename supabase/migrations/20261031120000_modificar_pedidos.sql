-- US-011: modificaciones de pedido y detalle auditable del historial.
alter table public.order_status_history
  add column event text not null default 'STATUS' check (event in ('STATUS', 'MODIFIED')),
  add column detail text check (detail is null or length(detail) <= 500);

-- Completa pedidos antiguos que quedaron sin el evento inicial de US-010.
insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, created_at)
select o.id, o.restaurant_id, null, o.status, o.created_by, o.created_at
from public.orders o
where not exists (
  select 1 from public.order_status_history h where h.order_id = o.id
);

create or replace function public.modificar_pedido(
  p_pedido_id uuid,
  p_cambios jsonb,
  p_motivo text default null
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_roles text[];
  v_reason text := nullif(trim(p_motivo), '');
  v_cambio jsonb;
  v_item public.order_items%rowtype;
  v_cantidad integer;
  v_observacion text;
  v_total numeric;
  v_detail text := '';
  v_nombre text;
  v_ids uuid[] := array[]::uuid[];
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select * into v_order from public.orders where id = p_pedido_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  v_roles := array['WAITER', 'OWNER', 'ADMIN'];
  if not private.has_role(v_order.restaurant_id, v_roles) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_order.status in ('READY', 'DELIVERED', 'CANCELLED') then
    raise exception 'INVALID_STATE' using errcode = '22023';
  end if;
  if v_order.status = 'IN_PROGRESS' and not private.has_role(v_order.restaurant_id, array['OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_order.status = 'IN_PROGRESS' and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 200 then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cambios) = 0 then
    raise exception 'INVALID_CHANGES' using errcode = '22023';
  end if;

  for v_cambio in select value from jsonb_array_elements(p_cambios)
  loop
    if jsonb_typeof(v_cambio) <> 'object'
      or not (v_cambio ? 'itemId') or not (v_cambio ? 'cantidad')
      or (v_cambio->>'itemId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_cambio->>'cantidad') !~ '^(0|[1-9][0-9]*)$'
      or (v_cambio ? 'observacion' and jsonb_typeof(v_cambio->'observacion') not in ('string', 'null')) then
      raise exception 'INVALID_CHANGES' using errcode = '22023';
    end if;
    v_cantidad := (v_cambio->>'cantidad')::integer;
    if (v_cambio->>'itemId')::uuid = any(v_ids) then
      raise exception 'INVALID_CHANGES' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, (v_cambio->>'itemId')::uuid);
    v_observacion := case when v_cambio ? 'observacion' then nullif(trim(v_cambio->>'observacion'), '') else null end;
    if v_cantidad > 20 or (v_observacion is not null and length(v_observacion) > 140) then
      raise exception 'INVALID_CHANGES' using errcode = '22023';
    end if;

    select * into v_item from public.order_items
      where id = (v_cambio->>'itemId')::uuid and order_id = v_order.id for update;
    if not found then raise exception 'INVALID_CHANGES' using errcode = '22023'; end if;
    v_nombre := v_item.product_name;
    if not (v_cambio ? 'observacion') then v_observacion := v_item.observation; end if;
    if v_cantidad = 0 then
      delete from public.order_items where id = v_item.id;
      v_detail := concat_ws('; ', nullif(v_detail, ''), 'quitado ' || v_nombre);
    else
      update public.order_items
        set quantity = v_cantidad, observation = v_observacion, subtotal = unit_price * v_cantidad
        where id = v_item.id;
      if v_cantidad <> v_item.quantity then
        v_detail := concat_ws('; ', nullif(v_detail, ''), v_nombre || ' ' || v_item.quantity || ' → ' || v_cantidad);
      elsif v_observacion is distinct from v_item.observation then
        v_detail := concat_ws('; ', nullif(v_detail, ''), 'observación de ' || v_nombre || ' actualizada');
      end if;
    end if;
  end loop;

  if not exists (select 1 from public.order_items where order_id = v_order.id) then
    raise exception 'ORDER_EMPTY' using errcode = '22023';
  end if;
  select coalesce(sum(subtotal), 0) into v_total from public.order_items where order_id = v_order.id;
  update public.orders set total = v_total where id = v_order.id;
  if v_detail = '' then v_detail := 'Se guardaron cambios en los productos'; end if;
  insert into public.order_status_history
    (order_id, restaurant_id, from_status, to_status, changed_by, reason, event, detail)
  values (v_order.id, v_order.restaurant_id, v_order.status, v_order.status, v_user, v_reason, 'MODIFIED', left(v_detail, 500));
  return v_total;
end;
$$;

revoke all on function public.modificar_pedido(uuid, jsonb, text) from public, anon;
grant execute on function public.modificar_pedido(uuid, jsonb, text) to authenticated;
