-- US-097: confirma vencimientos aunque se rechace un nuevo pedido por el límite QR.
begin;

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

  -- El bloqueo transaccional se conserva hasta que termine el RPC de registro.
  -- Si el límite se alcanza, RETURN NULL omite solo esta fila y permite que el
  -- RPC devuelva el rechazo normalmente; una excepción revertiría también los
  -- vencimientos, el historial y la devolución de stock hechos antes.
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
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.us097_limitar_pedidos_pendientes_qr()
  from public, anon, authenticated, service_role;

commit;
