-- US-069: ingreso directo a preparación, conservando las funciones de registro.
begin;

alter table public.orders alter column status set default 'IN_PROGRESS';
-- Fecha de la última entrada a READY para validar Deshacer sin exponer el historial.
alter table public.orders add column ready_at timestamptz;
update public.orders o set ready_at = (
  select max(h.created_at) from public.order_status_history h
  where h.order_id = o.id and h.to_status = 'READY'
) where o.status = 'READY';

-- Registrar la conversión antes de actualizar, sin alterar el historial anterior.
insert into public.order_status_history
  (order_id, restaurant_id, from_status, to_status, reason)
select id, restaurant_id, status, 'IN_PROGRESS', 'US-069: ingreso directo a preparación'
from public.orders where status in ('PENDING', 'ACCEPTED');
update public.orders set status = 'IN_PROGRESS' where status in ('PENDING', 'ACCEPTED');

create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado text,
  p_motivo text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(p_motivo), '');
  v_roles text[];
begin
  if v_user is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
    where id = p_pedido_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_reason is not null and length(v_reason) > 200 then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;

  if (v_order.status, p_estado) in (
    ('IN_PROGRESS', 'READY'), ('READY', 'IN_PROGRESS'),
    ('READY', 'DELIVERED'), ('PENDING', 'CANCELLED'), ('ACCEPTED', 'CANCELLED'),
    ('IN_PROGRESS', 'CANCELLED')
  ) then
    null;
  else
    raise exception 'INVALID_TRANSITION' using errcode = '22023';
  end if;

  if p_estado = 'CANCELLED' then
    if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  end if;

  if p_estado in ('IN_PROGRESS', 'READY') then
    v_roles := array['KITCHEN', 'OWNER', 'ADMIN'];
  elsif p_estado in ('DELIVERED', 'CANCELLED') then
    v_roles := array['WAITER', 'OWNER', 'ADMIN'];
  else
    v_roles := array['OWNER', 'ADMIN'];
  end if;

  if not private.has_role(v_order.restaurant_id, v_roles) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Evaluar el reloj después de adquirir el bloqueo, incluso si hubo espera.
  if v_order.status = 'READY' and p_estado = 'IN_PROGRESS' and
     (v_order.ready_at is null or clock_timestamp() > v_order.ready_at + interval '5 minutes') then
    raise exception 'UNDO_EXPIRED' using errcode = '22023';
  end if;

  update public.orders
    set status = p_estado,
        ready_at = case when p_estado = 'READY' then clock_timestamp() else null end
    where id = v_order.id;
  insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, reason)
  values (v_order.id, v_order.restaurant_id, v_order.status, p_estado, v_user, v_reason);
  return p_estado;
end;
$$;


revoke all on function public.cambiar_estado_pedido(uuid, text, text) from public, anon;
grant execute on function public.cambiar_estado_pedido(uuid, text, text) to authenticated;
commit;
