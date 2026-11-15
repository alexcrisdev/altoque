-- US-097: distingue un reintento idempotente del rechazo de la función QR antigua.
begin;

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
  v_restaurant_id uuid;
  v_result record;
  v_repetido boolean;
begin
  select q.restaurant_id into v_restaurant_id
    from public.qr_codes q where q.id = p_qr_code_id;
  perform public.bloquear_stock_items(
    v_restaurant_id, (now() at time zone 'America/Lima')::date, p_items
  );

  for v_result in
    select * from public.registrar_pedido_qr_sin_bloqueo_stock(
      p_qr_code_id, p_idempotency_key, p_items
    )
  loop
    if v_result.pedido_id is null then
      -- La misma forma de resultado también representa el rechazo del trigger.
      -- Consultar la clave permite marcar como repetido solo un pedido existente.
      select exists (
        select 1 from public.orders o
        where o.qr_code_id = p_qr_code_id
          and o.idempotency_key = p_idempotency_key
      ) into v_repetido;
      return query select v_result.pedido_id, v_result.numero_pedido, v_repetido;
    else
      return query select v_result.pedido_id, v_result.numero_pedido, v_result.repetido;
    end if;
  end loop;
end;
$$;

revoke all on function public.registrar_pedido_qr(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_pedido_qr(uuid, uuid, jsonb)
  to service_role;

commit;
