-- Conserva el registro existente y añade la declaración en la misma transacción.
begin;
alter function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb)
  rename to registrar_pedido_mesero_us108_interno;
revoke all on function public.registrar_pedido_mesero_us108_interno(uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.registrar_pedido_mesero(
  p_restaurant_id uuid, p_modality text, p_dining_table_id uuid, p_branch_id uuid,
  p_idempotency_key uuid, p_items jsonb,
  p_alergia_respuesta text default null, p_alergenos text[] default null,
  p_alergia_detalle text default null
) returns table (pedido_id uuid, numero_pedido bigint, repetido boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido record;
begin
  if not private.has_role(p_restaurant_id, array['WAITER', 'OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_alergia_respuesta is null then
    if coalesce(cardinality(p_alergenos), 0) > 0 or nullif(trim(p_alergia_detalle), '') is not null then
      raise exception 'INVALID_ALLERGY' using errcode = '22023';
    end if;
  elsif p_alergia_respuesta not in ('NONE', 'YES') or p_alergenos is null
    or cardinality(p_alergenos) > 6 or array_position(p_alergenos, null) is not null
    or not (p_alergenos <@ array['MANI','MARISCOS','PESCADO','GLUTEN','LACTEOS','HUEVO']::text[])
    or length(p_alergia_detalle) > 120
    or (p_alergia_respuesta = 'YES' and cardinality(p_alergenos) = 0 and nullif(trim(p_alergia_detalle), '') is null)
    or (p_alergia_respuesta = 'NONE' and (cardinality(p_alergenos) > 0 or nullif(trim(p_alergia_detalle), '') is not null)) then
    raise exception 'INVALID_ALLERGY' using errcode = '22023';
  end if;

  select * into v_pedido from public.registrar_pedido_mesero_us108_interno(
    p_restaurant_id, p_modality, p_dining_table_id, p_branch_id, p_idempotency_key, p_items
  );
  if not v_pedido.repetido and p_alergia_respuesta is not null then
    update public.orders set allergy_answer = p_alergia_respuesta, allergens = p_alergenos,
      allergy_note = nullif(trim(p_alergia_detalle), '')
    where id = v_pedido.pedido_id and restaurant_id = p_restaurant_id;
  end if;
  return query select v_pedido.pedido_id::uuid, v_pedido.numero_pedido::bigint, v_pedido.repetido::boolean;
end;
$$;
revoke all on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb, text, text[], text)
  from public, anon, service_role;
grant execute on function public.registrar_pedido_mesero(uuid, text, uuid, uuid, uuid, jsonb, text, text[], text)
  to authenticated;
commit;
