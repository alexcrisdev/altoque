-- US-063: una mesa no se cierra con pedidos sin entregar y, una vez cerrada,
-- sus pedidos ya no cambian (antes solo se protegían los pedidos para llevar).
-- No cambia cerrar_cuenta: la función cierra la mesa con un UPDATE a table_sessions,
-- y el trigger de ese UPDATE es la única puerta para los dos caminos de cierre
-- (caja con cerrar_cuenta y el botón «Cerrar mesa» del mesero).

begin;

-- ¿La mesa tiene pedidos que todavía no llegan al cliente?
-- Entregados y cancelados son estados finales; todo lo demás sigue abierto.
create function private.pedidos_sin_entregar_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.orders o
      where o.table_session_id = p_sesion_id
        and o.status in ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'READY')
  );
$$;

revoke all on function private.pedidos_sin_entregar_sesion(uuid) from public, anon, authenticated;

-- Reemplaza la versión de US-020 (20261104120000) y agrega la regla de US-063 al final,
-- así los mensajes de Yape por verificar y de saldo pendiente siguen saliendo primero.
create or replace function private.impedir_cierre_con_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.closed_at is null and new.closed_at is not null then
    if exists (select 1 from public.payments p where p.table_session_id = old.id and p.status = 'PENDING') then
      raise exception 'PENDING_PAYMENTS' using errcode = '23514';
    end if;
    if private.saldo_pendiente_sesion(old.id) > 0 and not exists (
      select 1 from public.account_closures c where c.table_session_id = old.id and c.kind = 'EXCEPTION'
    ) then
      raise exception 'SALDO_PENDIENTE' using errcode = '23514';
    end if;
    -- US-063: también vale para la excepción autorizada: primero se entrega o se cancela.
    if private.pedidos_sin_entregar_sesion(old.id) then
      raise exception 'PEDIDOS_SIN_ENTREGAR' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.impedir_cierre_con_saldo() from public, anon, authenticated;

-- Reemplaza la versión de US-020: además del pedido para llevar cerrado, ahora revisa
-- la mesa (sesión) del pago o del producto. Una mesa con closed_at ya cerró su cuenta,
-- también las cerradas antes de US-020, que no tienen fila en account_closures.
create or replace function private.impedir_cambios_cuenta_cerrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido uuid;
  v_sesion uuid;
begin
  if tg_table_name = 'payments' then
    v_pedido := new.order_id;
    v_sesion := new.table_session_id;
  else
    v_pedido := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    select o.table_session_id into v_sesion from public.orders o where o.id = v_pedido;
  end if;

  if v_pedido is not null and exists (select 1 from public.account_closures c where c.order_id = v_pedido) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '23514';
  end if;
  if v_sesion is not null and exists (
    select 1 from public.table_sessions s where s.id = v_sesion and s.closed_at is not null
  ) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.impedir_cambios_cuenta_cerrada() from public, anon, authenticated;

-- Un pedido de una mesa ya cerrada no se modifica, no se cancela ni cambia de estado,
-- y no se agregan pedidos nuevos a esa mesa. Los pedidos para llevar no entran aquí:
-- se pagan antes (US-085) y la cocina los sigue preparando aunque su cuenta esté cerrada.
create function private.us063_impedir_cambios_pedido_mesa_cerrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sesion uuid := case when tg_op = 'INSERT' then new.table_session_id else old.table_session_id end;
begin
  if v_sesion is not null and exists (
    select 1 from public.table_sessions s where s.id = v_sesion and s.closed_at is not null
  ) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.us063_impedir_cambios_pedido_mesa_cerrada() from public, anon, authenticated, service_role;

create trigger orders_us063_impedir_mesa_cerrada
  before insert or update or delete on public.orders
  for each row execute function private.us063_impedir_cambios_pedido_mesa_cerrada();

commit;
