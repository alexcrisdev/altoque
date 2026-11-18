-- US-098: ejecutar únicamente en Supabase local. Todos los cambios se revierten.
begin;
insert into public.products(id, restaurant_id, category_id, name, price, active, available)
select id_producto, '10000000-0000-0000-0000-000000000001', c.id, 'Stock US-098 ' || right(id_producto::text, 1), 1, true, true
from (values ('98000000-0000-4000-8000-000000000001'::uuid),
             ('98000000-0000-4000-8000-000000000002'::uuid)) p(id_producto)
cross join lateral (select id from public.categories
 where restaurant_id = '10000000-0000-0000-0000-000000000001' order by id limit 1) c;
insert into public.product_daily_stock(restaurant_id, product_id, stock_date, quantity, sold) values
 ('10000000-0000-0000-0000-000000000001','98000000-0000-4000-8000-000000000001',(now() at time zone 'America/Lima')::date,5,5),
 ('10000000-0000-0000-0000-000000000001','98000000-0000-4000-8000-000000000002',(now() at time zone 'America/Lima')::date,9,2);
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='admin@demo.altoque.pe'),true);
set local role authenticated;
select public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',
 (now() at time zone 'America/Lima')::date,
 '[{"productoId":"98000000-0000-4000-8000-000000000001","cantidad":7}]',true);
do $$ begin
 if not exists(select 1 from public.product_daily_stock where product_id='98000000-0000-4000-8000-000000000001'
   and stock_date=(now() at time zone 'America/Lima')::date and quantity=7 and sold=5)
 then raise exception 'No preparó el agotado conservando vendidos'; end if;
 if not exists(select 1 from public.product_daily_stock where product_id='98000000-0000-4000-8000-000000000002'
   and stock_date=(now() at time zone 'America/Lima')::date and quantity=9 and sold=2)
 then raise exception 'Cambió otro producto'; end if;
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,
    '[{"productoId":"98000000-0000-4000-8000-000000000001","cantidad":4}]',true);
   raise exception 'Permitió cantidad inferior a vendidos';
 exception when check_violation then
   if sqlerrm <> 'STOCK_BELOW_SOLD' then raise; end if;
 end;
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,
    '[{"productoId":"98000000-0000-4000-8000-000000000001","cantidad":null}]',true);
   raise exception 'Borró un contador vendido';
 exception when check_violation then
   if sqlerrm <> 'STOCK_ALREADY_SOLD' then raise; end if;
 end;
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,
    '[{"productoId":"98000000-0000-4000-8000-000000000001","cantidad":7}]');
   raise exception 'Cambió la validación de la firma original';
 exception when check_violation then
   if sqlerrm <> 'INVALID_PRODUCT' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='cocina@demo.altoque.pe'),true);
set local role authenticated;
do $$ begin
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,'[]',true);
   raise exception 'Cocina pudo guardar stock';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='dueno@polleria.demo'),true);
set local role authenticated;
do $$ begin
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,'[]',true);
   raise exception 'Otro restaurante pudo guardar stock';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
   perform public.guardar_stock_diario('10000000-0000-0000-0000-000000000001',(now() at time zone 'America/Lima')::date,'[]',true);
   raise exception 'Anon pudo guardar stock';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'US-098: stock parcial y permisos aprobados';
rollback;
