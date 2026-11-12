-- US-078: reserva stock dentro de la transacción que inserta cada línea.
-- Si no existe una fila para hoy, el producto conserva venta sin límite.
alter table public.order_items
  add column stock_reserved boolean not null default false;

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
  if p_delta = 0 then return false; end if;

  select * into v_stock
    from public.product_daily_stock
    where restaurant_id = p_restaurant_id
      and product_id = p_product_id
      and stock_date = p_stock_date
    for update;

  -- Sin límite configurado, no hay unidades que reservar ni devolver.
  if not found then return false; end if;

  if p_delta > 0 then
    v_disponibles := v_stock.quantity - v_stock.sold;
    if v_disponibles < p_delta then
      raise exception 'STOCK_INSUFFICIENT:%:%', p_product_id, v_disponibles
        using errcode = '23514';
    end if;
    update public.product_daily_stock
      set sold = sold + p_delta
      where id = v_stock.id;
  else
    update public.product_daily_stock
      set sold = greatest(0, sold + p_delta)
      where id = v_stock.id;
  end if;
  return true;
end;
$$;

revoke all on function public.ajustar_stock_diario_pedido(uuid, uuid, date, integer)
  from public, anon, authenticated;

create or replace function public.reservar_stock_linea_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_day date;
  v_delta integer;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found or v_order.status = 'CANCELLED' then return new; end if;

  if tg_op = 'INSERT' then
    v_day := (now() at time zone 'America/Lima')::date;
    new.stock_reserved := public.ajustar_stock_diario_pedido(
      v_order.restaurant_id, new.product_id, v_day, new.quantity
    );
    return new;
  end if;

  if old.product_id is distinct from new.product_id then
    if old.stock_reserved then
      perform public.ajustar_stock_diario_pedido(
        v_order.restaurant_id, old.product_id, (v_order.created_at at time zone 'America/Lima')::date,
        -old.quantity
      );
    end if;
    new.stock_reserved := public.ajustar_stock_diario_pedido(
      v_order.restaurant_id, new.product_id, (v_order.created_at at time zone 'America/Lima')::date,
      new.quantity
    );
  else
    v_delta := new.quantity - old.quantity;
    if old.stock_reserved then
      perform public.ajustar_stock_diario_pedido(
        v_order.restaurant_id, new.product_id, (v_order.created_at at time zone 'America/Lima')::date,
        v_delta
      );
      new.stock_reserved := true;
    elsif v_delta > 0 then
      -- Si se definió límite después de crear un pedido sin límite y se amplía,
      -- contabiliza la cantidad completa al incorporarla al inventario diario.
      new.stock_reserved := public.ajustar_stock_diario_pedido(
        v_order.restaurant_id, new.product_id, (v_order.created_at at time zone 'America/Lima')::date,
        new.quantity
      );
    else
      new.stock_reserved := false;
    end if;
  end if;
  return new;
end;
$$;

create trigger order_items_reservar_stock
  before insert or update of quantity, product_id on public.order_items
  for each row execute function public.reservar_stock_linea_pedido();

create or replace function public.devolver_stock_linea_eliminada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if old.stock_reserved then
    select * into v_order from public.orders where id = old.order_id;
    if found and v_order.status <> 'CANCELLED' then
      perform public.ajustar_stock_diario_pedido(
        v_order.restaurant_id, old.product_id, (v_order.created_at at time zone 'America/Lima')::date,
        -old.quantity
      );
    end if;
  end if;
  return old;
end;
$$;

create trigger order_items_devolver_stock_eliminada
  after delete on public.order_items
  for each row execute function public.devolver_stock_linea_eliminada();

create or replace function public.devolver_stock_pedido_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_day date := (old.created_at at time zone 'America/Lima')::date;
begin
  if old.status <> 'CANCELLED' and new.status = 'CANCELLED' then
    for v_item in
      select product_id, product_name, sum(quantity)::integer as quantity
        from public.order_items
        where order_id = new.id and stock_reserved
        group by product_id, product_name
        order by product_id
    loop
      perform public.ajustar_stock_diario_pedido(
        new.restaurant_id, v_item.product_id, v_day, -v_item.quantity
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_devolver_stock_cancelado
  after update of status on public.orders
  for each row execute function public.devolver_stock_pedido_cancelado();

revoke all on function public.reservar_stock_linea_pedido() from public, anon, authenticated;
revoke all on function public.devolver_stock_linea_eliminada() from public, anon, authenticated;
revoke all on function public.devolver_stock_pedido_cancelado() from public, anon, authenticated;
