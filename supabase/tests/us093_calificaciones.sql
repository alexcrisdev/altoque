-- Solo supabase_db_altoque local: fixtures propios y rollback incluso al fallar.
begin;
select set_config('us093.caso', :'caso', true);
insert into public.branches(id, restaurant_id, name) values
 ('93000000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000001', 'Calificación local');
insert into public.dining_tables(id, restaurant_id, branch_id, number) values
 ('93000000-0000-4000-8000-000000000002', '10000000-0000-0000-0000-000000000001', '93000000-0000-4000-8000-000000000001', 2);
insert into public.qr_codes(id, restaurant_id, branch_id, dining_table_id, purpose, token_hash) values
 ('93000000-0000-4000-8000-000000000003', '10000000-0000-0000-0000-000000000001', '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002', 'DINE_IN', repeat('9',64));
insert into public.table_sessions(id, restaurant_id, branch_id, dining_table_id, opened_by)
 select '93000000-0000-4000-8000-000000000004', '10000000-0000-0000-0000-000000000001', '93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000002', id from auth.users where email = 'mesero@demo.altoque.pe';
insert into public.orders(id, restaurant_id, branch_id, qr_code_id, table_session_id, dining_table_id, modality, total, idempotency_key)
 values ('93000000-0000-4000-8000-000000000005', '10000000-0000-0000-0000-000000000001', '93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000002',
 'DINE_IN', 10, '93000000-0000-4000-8000-000000000006');

-- Producto de prueba propio, sin alterar stock de productos del equipo.
insert into public.products(id, restaurant_id, category_id, name, price, available)
 select '93000000-0000-4000-8000-000000000007', '10000000-0000-0000-0000-000000000001', id, 'Calificación US-093', 10, true
 from public.categories where restaurant_id = '10000000-0000-0000-0000-000000000001' order by id limit 1;
insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, subtotal)
 values ('93000000-0000-4000-8000-000000000005', '93000000-0000-4000-8000-000000000007', 'Calificación US-093', 1, 10, 10);

-- La entrega permite opinar aunque la cuenta aún tenga saldo.
update public.orders set status = 'DELIVERED' where id = '93000000-0000-4000-8000-000000000005'
 and current_setting('us093.caso') not in ('sin_pagar','pagado','cancelado');
update public.orders set status = 'CANCELLED' where id = '93000000-0000-4000-8000-000000000005'
 and current_setting('us093.caso') = 'cancelado';

do $$
declare
  c text := current_setting('us093.caso');
begin
  if c = 'pagado' then
    perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email='caja@demo.altoque.pe'), true);
    set local role authenticated;
    perform public.registrar_pago('93000000-0000-4000-8000-000000000004', null, 'CASH', 10, 10, null, null, gen_random_uuid());
    reset role;
    if (select status from public.orders where id='93000000-0000-4000-8000-000000000005') <> 'IN_PROGRESS' then
      raise exception 'El pago no liberó el pedido'; end if;
  end if;
end $$;
set local role service_role;
do $$
declare
  c text := current_setting('us093.caso');
  q uuid := '93000000-0000-4000-8000-000000000003';
  k uuid := '93000000-0000-4000-8000-000000000006';
begin
  if c in ('sin_pagar','cancelado') then
    if (select disponible from public.estado_calificacion_cliente(q,k)) then raise exception 'Pedido no elegible'; end if;
    begin
      perform public.calificar_pedido_cliente(q,k,5::smallint,4::smallint,null);
      raise exception 'Aceptó pedido no elegible';
    exception when invalid_parameter_value then
      if sqlerrm <> 'RATING_NOT_AVAILABLE' then raise; end if;
    end;
  elsif c = 'credenciales' then
    if exists(select 1 from public.estado_calificacion_cliente(q,gen_random_uuid())) then raise exception 'Filtró otro pedido'; end if;
    begin
      perform public.calificar_pedido_cliente(gen_random_uuid(),k,5::smallint,4::smallint,null);
      raise exception 'Aceptó otro QR';
    exception when no_data_found then null;
    end;
    begin
      perform public.calificar_pedido_cliente(q,gen_random_uuid(),5::smallint,4::smallint,null);
      raise exception 'Aceptó otra clave';
    exception when no_data_found then null;
    end;
  elsif c = 'estrellas' then
    begin
      perform public.calificar_pedido_cliente(q,k,0::smallint,6::smallint,null);
      raise exception 'Aceptó estrellas inválidas';
    exception when invalid_parameter_value then null;
    end;
  elsif c = 'comentario' then
    begin
      perform public.calificar_pedido_cliente(q,k,5::smallint,4::smallint,repeat('a',201));
      raise exception 'Aceptó comentario largo';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform public.calificar_pedido_cliente(q,k,5::smallint,4::smallint,E'hola\n');
      raise exception 'Aceptó caracteres de control';
    exception when invalid_parameter_value then null;
    end;
  else
    if not (select disponible from public.estado_calificacion_cliente(q,k)) then raise exception 'No disponible'; end if;
    perform public.calificar_pedido_cliente(q,k,5::smallint,4::smallint,' Gracias ');
    if not (select calificada from public.estado_calificacion_cliente(q,k)) then raise exception 'No recordó calificada'; end if;
    if (select disponible from public.estado_calificacion_cliente(q,k)) then raise exception 'Permite volver a ofrecer'; end if;
    if c = 'duplicado' then
      begin
        perform public.calificar_pedido_cliente(q,k,1::smallint,1::smallint,'Repetida');
        raise exception 'Aceptó segunda calificación';
      exception when unique_violation then null;
      end;
    end if;
  end if;
end $$;
reset role;
do $$ begin
  if current_setting('us093.caso') in ('guardar','duplicado','otro_restaurante','roles','anonimo','pagado') then
    if not exists(select 1 from public.order_ratings where order_id='93000000-0000-4000-8000-000000000005'
      and restaurant_id='10000000-0000-0000-0000-000000000001' and service_stars=5 and waiter_stars=4 and comment='Gracias') then
      raise exception 'No guardó valores normalizados'; end if;
  elsif exists(select 1 from public.order_ratings where order_id='93000000-0000-4000-8000-000000000005') then
    raise exception 'Guardó una entrada rechazada';
  end if;
end $$;

-- El personal distinto de OWNER/ADMIN no lee, ni siquiera en su restaurante.
do $$ declare correo text; begin
  if current_setting('us093.caso') = 'roles' then
    foreach correo in array array['mesero@demo.altoque.pe','cocina@demo.altoque.pe','caja@demo.altoque.pe','dueno@polleria.demo'] loop
      perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email=correo),true);
      set local role authenticated;
      if exists(select 1 from public.order_ratings) then raise exception 'Rol no autorizado leyó'; end if;
      reset role;
    end loop;
  end if;
  if current_setting('us093.caso') = 'otro_restaurante' then
    perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email='dueno@polleria.demo'),true);
    set local role authenticated;
    if exists(select 1 from public.order_ratings) then raise exception 'Otro restaurante leyó'; end if;
    reset role;
  end if;
  if current_setting('us093.caso') in ('guardar','roles') then
    foreach correo in array array['dueno@demo.altoque.pe','admin@demo.altoque.pe'] loop
      perform set_config('request.jwt.claim.sub',(select id::text from auth.users where email=correo),true);
      set local role authenticated;
      if (select count(*) from public.order_ratings) <> 1 then raise exception 'Admin no leyó'; end if;
      begin
        perform public.calificar_pedido_cliente('93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000006',5::smallint,5::smallint,null);
        raise exception 'Personal accedió al RPC de inserción';
      exception when insufficient_privilege then null;
      end;
      reset role;
    end loop;
  end if;
  if current_setting('us093.caso') = 'anonimo' then
    set local role anon;
    begin
      perform count(*) from public.order_ratings;
      raise exception 'Anónimo leyó';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.order_ratings(restaurant_id,order_id,service_stars,waiter_stars)
      values('10000000-0000-0000-0000-000000000001','93000000-0000-4000-8000-000000000005',5,5);
      raise exception 'Anónimo insertó';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.calificar_pedido_cliente('93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000006',5::smallint,5::smallint,null);
      raise exception 'Anónimo ejecutó RPC';
    exception when insufficient_privilege then null;
    end;
    reset role;
  end if;
end $$;
select 'US-093: caso aprobado';
rollback;
