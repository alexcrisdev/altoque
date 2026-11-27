-- US-148: ejecutar únicamente en Supabase local. Todos los cambios se revierten.
-- Simula un restaurante que existía antes de la migración y corre la función dos veces.
begin;
-- Sin el trigger, para que el restaurante quede como antes de US-148.
alter table public.restaurants disable trigger restaurants_us148_categorias_estandar;
insert into public.restaurants(id, name, slug)
values ('14800000-0000-4000-8000-000000000001', 'Prueba US-148', 'prueba-us148');
alter table public.restaurants enable trigger restaurants_us148_categorias_estandar;

insert into public.categories(id, restaurant_id, name, sort_order, active) values
 ('14800000-0000-4000-8000-0000000000c1', '14800000-0000-4000-8000-000000000001', 'Pollos',       1, true),
 ('14800000-0000-4000-8000-0000000000c2', '14800000-0000-4000-8000-000000000001', 'Ceviches',     2, true),
 ('14800000-0000-4000-8000-0000000000c3', '14800000-0000-4000-8000-000000000001', 'Chicharrones', 3, true),
 ('14800000-0000-4000-8000-0000000000c4', '14800000-0000-4000-8000-000000000001', 'Bebidas',      4, true),
 ('14800000-0000-4000-8000-0000000000c5', '14800000-0000-4000-8000-000000000001', 'Combos',       0, true),
 -- Ya existía una "Entradas" (inactiva, en otro orden): se reúsa, no se duplica.
 ('14800000-0000-4000-8000-0000000000c6', '14800000-0000-4000-8000-000000000001', 'Entradas',     9, false);

insert into public.products(id, restaurant_id, category_id, name, price) values
 ('14800000-0000-4000-8000-0000000000a1', '14800000-0000-4000-8000-000000000001', '14800000-0000-4000-8000-0000000000c2', 'Ceviche US-148', 30),
 ('14800000-0000-4000-8000-0000000000a2', '14800000-0000-4000-8000-000000000001', '14800000-0000-4000-8000-0000000000c3', 'Chicharrón US-148', 30),
 ('14800000-0000-4000-8000-0000000000a3', '14800000-0000-4000-8000-000000000001', '14800000-0000-4000-8000-0000000000c4', 'Chicha US-148', 8),
 ('14800000-0000-4000-8000-0000000000a4', '14800000-0000-4000-8000-000000000001', '14800000-0000-4000-8000-0000000000c1', 'Pollo US-148', 60);

select private.us148_estandarizar_categorias('14800000-0000-4000-8000-000000000001');
create temporary table us148_primera on commit drop as
 select c.id, c.name, c.sort_order, c.active from public.categories c
 where c.restaurant_id = '14800000-0000-4000-8000-000000000001';
create temporary table us148_platos on commit drop as
 select id, category_id from public.products where restaurant_id = '14800000-0000-4000-8000-000000000001';

-- Segunda vez (la migración y el seed la usan): no debe cambiar nada.
select private.us148_estandarizar_categorias('14800000-0000-4000-8000-000000000001');

do $$
declare
  r constant uuid := '14800000-0000-4000-8000-000000000001';
  v_orden text;
begin
  select string_agg(name, '|' order by sort_order) into v_orden
  from public.categories where restaurant_id = r and active;
  if v_orden is distinct from 'Entradas|Sopas y caldos|Ensaladas|Platos de fondo|Guarniciones|Postres|Menú infantil|Bebidas sin alcohol|Bebidas calientes|Bebidas con alcohol|Combos|Pollos'
  then raise exception 'Orden de categorías activas incorrecto: %', v_orden; end if;

  if (select count(*) from public.categories where restaurant_id = r and name = 'Entradas') <> 1
     or not exists(select 1 from public.categories where id = '14800000-0000-4000-8000-0000000000c6' and active and sort_order = 1)
  then raise exception 'No reusó la categoría Entradas existente'; end if;

  if (select count(*) from public.categories where restaurant_id = r) <> 15
  then raise exception 'Duplicó categorías'; end if;

  if exists(select 1 from public.categories where restaurant_id = r
            and name in ('Ceviches', 'Chicharrones', 'Bebidas') and active)
     or (select count(*) from public.categories where restaurant_id = r
         and name in ('Ceviches', 'Chicharrones', 'Bebidas')) <> 3
  then raise exception 'Las categorías antiguas deben quedar desactivadas, no borradas'; end if;

  if (select c.name from public.products p join public.categories c on c.id = p.category_id
      where p.id = '14800000-0000-4000-8000-0000000000a1') <> 'Entradas'
  or (select c.name from public.products p join public.categories c on c.id = p.category_id
      where p.id = '14800000-0000-4000-8000-0000000000a2') <> 'Platos de fondo'
  or (select c.name from public.products p join public.categories c on c.id = p.category_id
      where p.id = '14800000-0000-4000-8000-0000000000a3') <> 'Bebidas sin alcohol'
  or (select category_id from public.products where id = '14800000-0000-4000-8000-0000000000a4')
      <> '14800000-0000-4000-8000-0000000000c1'
  then raise exception 'Platos movidos a una categoría incorrecta'; end if;

  if exists(
    (select id, name, sort_order, active from public.categories where restaurant_id = r
     except select id, name, sort_order, active from us148_primera)
    union all
    (select id, name, sort_order, active from us148_primera
     except select id, name, sort_order, active from public.categories where restaurant_id = r))
  or exists(
    (select id, category_id from public.products where restaurant_id = r except select * from us148_platos)
    union all
    (select * from us148_platos except select id, category_id from public.products where restaurant_id = r))
  then raise exception 'Correr la función dos veces cambió categorías o platos'; end if;

  if has_function_privilege('anon', 'private.us148_estandarizar_categorias(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.us148_estandarizar_categorias(uuid)', 'execute')
  then raise exception 'La función no debe ser ejecutable por anon ni authenticated'; end if;
end $$;

-- Restaurante nuevo: el trigger crea las 10 categorías.
insert into public.restaurants(id, name, slug)
values ('14800000-0000-4000-8000-000000000002', 'Prueba US-148 nuevo', 'prueba-us148-nuevo');
do $$ begin
  if (select string_agg(name || ':' || sort_order, '|' order by sort_order) from public.categories
      where restaurant_id = '14800000-0000-4000-8000-000000000002' and active)
     is distinct from 'Entradas:1|Sopas y caldos:2|Ensaladas:3|Platos de fondo:4|Guarniciones:5|Postres:6|Menú infantil:7|Bebidas sin alcohol:8|Bebidas calientes:9|Bebidas con alcohol:10'
  then raise exception 'El restaurante nuevo no recibió las 10 categorías en orden'; end if;
end $$;

select 'US-148: categorías estándar, reúso e idempotencia aprobados';
rollback;
