-- US-148: categorías estándar de la carta.
-- Cada restaurante tiene 10 categorías en orden fijo. Los platos de Ceviches, Chicharrones
-- y Bebidas pasan a su categoría nueva y esas categorías se desactivan (no se borran:
-- historial y reportes guardan producto y pedido, no categoría).
-- Las demás categorías del restaurante quedan activas con sus platos, después de las 10.
-- No borra ni renombra columnas y no cambia permisos de tablas.

create or replace function private.us148_estandarizar_categorias(p_restaurante uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalogo constant text[] := array[
    'Entradas', 'Sopas y caldos', 'Ensaladas', 'Platos de fondo', 'Guarniciones',
    'Postres', 'Menú infantil', 'Bebidas sin alcohol', 'Bebidas calientes', 'Bebidas con alcohol'
  ];
  v_antigua text;
  v_nueva text;
begin
  -- 1. Las 10 categorías, en orden 1..10. Si el nombre ya existe (unique por restaurante
  --    y nombre), se reúsa: se reactiva y toma su lugar en el catálogo.
  insert into public.categories (restaurant_id, name, sort_order, active)
  select p_restaurante, c.nombre, c.orden::integer, true
  from unnest(v_catalogo) with ordinality as c(nombre, orden)
  on conflict (restaurant_id, name)
  do update set sort_order = excluded.sort_order, active = true
  where public.categories.sort_order is distinct from excluded.sort_order
     or not public.categories.active;

  -- 2. Platos de las categorías antiguas a su categoría nueva; la antigua se desactiva.
  for v_antigua, v_nueva in
    select * from (values
      ('Ceviches', 'Entradas'),
      ('Chicharrones', 'Platos de fondo'),
      ('Bebidas', 'Bebidas sin alcohol')
    ) as m(antigua, nueva)
  loop
    update public.products p
    set category_id = nueva.id
    from public.categories antigua, public.categories nueva
    where antigua.restaurant_id = p_restaurante and antigua.name = v_antigua
      and nueva.restaurant_id = p_restaurante and nueva.name = v_nueva
      and p.restaurant_id = p_restaurante and p.category_id = antigua.id;

    update public.categories
    set active = false
    where restaurant_id = p_restaurante and name = v_antigua and active;
  end loop;

  -- 3. Las demás categorías activas van después de las 10 (11, 12...), respetando su orden.
  --    Correr la función otra vez da los mismos números.
  with otras as (
    select c.id,
           10 + row_number() over (order by c.sort_order, c.name, c.id) as orden
    from public.categories c
    where c.restaurant_id = p_restaurante
      and c.active
      and c.name <> all (v_catalogo)
  )
  update public.categories c
  set sort_order = otras.orden
  from otras
  where c.id = otras.id and c.sort_order is distinct from otras.orden;
end;
$$;

revoke execute on function private.us148_estandarizar_categorias(uuid) from public, anon, authenticated;

-- Restaurante nuevo: nace con las 10 categorías.
create or replace function private.us148_categorias_restaurante_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.us148_estandarizar_categorias(new.id);
  return new;
end;
$$;

revoke execute on function private.us148_categorias_restaurante_nuevo() from public, anon, authenticated;

create trigger restaurants_us148_categorias_estandar
  after insert on public.restaurants
  for each row execute function private.us148_categorias_restaurante_nuevo();

-- Restaurantes que ya existen.
do $$
declare
  v_restaurante uuid;
begin
  for v_restaurante in select id from public.restaurants order by id loop
    perform private.us148_estandarizar_categorias(v_restaurante);
  end loop;
end;
$$;
