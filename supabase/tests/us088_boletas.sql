-- Ejecutar SOLO en supabase_db_altoque local con psql -v ON_ERROR_STOP=1.
-- Transacción reversible: no deja usuarios, pagos, sesiones ni configuración.
begin;
insert into auth.users(id, email) values
 ('88000000-0000-4000-8000-000000000001', 'caja-us088@example.test'),
 ('88000000-0000-4000-8000-000000000002', 'otro-us088@example.test');
insert into public.users(id, full_name) values
 ('88000000-0000-4000-8000-000000000001', 'Caja local US-088'),
 ('88000000-0000-4000-8000-000000000002', 'Otro restaurante local');
insert into public.staff_memberships(user_id, restaurant_id, role_id)
 select '88000000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000001', id from public.roles where code = 'CASHIER';
insert into public.staff_memberships(user_id, restaurant_id, role_id)
 select '88000000-0000-4000-8000-000000000002', '10000000-0000-0000-0000-000000000002', id from public.roles where code = 'CASHIER';
insert into public.receipt_series(restaurant_id, series, next_number)
 values ('10000000-0000-0000-0000-000000000001', 'BBB1', 7);
insert into public.table_sessions(id, restaurant_id, branch_id, dining_table_id, opened_by)
 values ('88000000-0000-4000-8000-000000000010', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '88000000-0000-4000-8000-000000000001');
insert into public.orders(id, restaurant_id, branch_id, qr_code_id, table_session_id, dining_table_id, modality, total, idempotency_key)
 select '88000000-0000-4000-8000-000000000011', restaurant_id, branch_id, id,
 '88000000-0000-4000-8000-000000000010', dining_table_id, 'DINE_IN', 32, gen_random_uuid()
 from public.qr_codes where dining_table_id = '30000000-0000-0000-0000-000000000001' and active;
insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, subtotal)
 select '88000000-0000-4000-8000-000000000011', id, name, 1, 32, 32 from public.products
 where restaurant_id = '10000000-0000-0000-0000-000000000001' and name = 'Ceviche clásico';

select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000001', true);
set local role authenticated;
-- Firma anterior eliminada y nueva firma compatible con llamadas sin correo.
select * from public.registrar_pago('88000000-0000-4000-8000-000000000010', null, 'CASH', 10, 10, null, null, '88000000-0000-4000-8000-000000000020');
do $$ begin
 if exists(select 1 from public.receipts) then raise exception 'FAIL parcial reservó boleta'; end if;
end $$;
-- Una dirección inválida aborta exclusivamente su pago.
do $$ begin
 begin
   perform public.registrar_pago('88000000-0000-4000-8000-000000000010', null, 'CASH', 1, 1, null, null, gen_random_uuid(), 'invalido');
   raise exception 'FAIL correo inválido aceptado';
 exception when check_violation then null;
 end;
end $$;
select * from public.registrar_pago('88000000-0000-4000-8000-000000000010', null, 'YAPE', 22, null, 'YAPE-088', null, '88000000-0000-4000-8000-000000000021', 'cliente@example.test');
do $$ begin
 if exists(select 1 from public.receipts) then raise exception 'FAIL Yape pendiente reservó boleta'; end if;
end $$;
select public.verificar_pago((select id from public.payments where idempotency_key = '88000000-0000-4000-8000-000000000021'), true);
do $$ begin
 if (select count(*) from public.receipts where series = 'BBB1' and number = 7 and status = 'PENDIENTE') <> 1 then raise exception 'FAIL reserva al verificar Yape'; end if;
 if (select receipt_email from public.payments where idempotency_key = '88000000-0000-4000-8000-000000000021') <> 'cliente@example.test' then raise exception 'FAIL correo no persistido'; end if;
 begin
   perform public.actualizar_boleta_prueba(gen_random_uuid(), 'BBB1', 7, 'ERROR');
   raise exception 'FAIL callback accesible a authenticated';
 exception when insufficient_privilege then null;
 end;
end $$;
-- Reintento del mismo pago no cambia reserva ni número.
select * from public.registrar_pago('88000000-0000-4000-8000-000000000010', null, 'CASH', 10, 10, null, null, '88000000-0000-4000-8000-000000000020');
reset role;
do $$ begin
 if (select next_number from public.receipt_series where restaurant_id = '10000000-0000-0000-0000-000000000001') <> 8 then raise exception 'FAIL correlativo no avanzó una vez'; end if;
 if to_regprocedure('public.registrar_pago(uuid,uuid,text,numeric,numeric,text,boolean,uuid)') is not null then raise exception 'FAIL firma vieja de caja'; end if;
 if to_regprocedure('public.registrar_pago_stripe(text,text,uuid,uuid,numeric)') is not null then raise exception 'FAIL firma vieja de Stripe'; end if;
end $$;
-- RLS: otro restaurante no lee ni modifica la boleta; anon tampoco.
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.receipts) then raise exception 'FAIL aislamiento entre restaurantes'; end if;
 begin
   insert into public.receipts(restaurant_id, payment_id, order_id, series, number) values ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), gen_random_uuid(), 'BBB1', 50);
   raise exception 'FAIL escritura directa permitida';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
   perform count(*) from public.receipts;
   raise exception 'FAIL lectura anónima';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
-- Mesero y cocina del mismo restaurante no leen receipts.
update public.staff_memberships set role_id = (select id from public.roles where code = 'WAITER') where user_id = '88000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$ begin if exists(select 1 from public.receipts) then raise exception 'FAIL mesero lee boleta'; end if; end $$;
reset role;
update public.staff_memberships set role_id = (select id from public.roles where code = 'KITCHEN') where user_id = '88000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if exists(select 1 from public.receipts) then raise exception 'FAIL cocina lee boleta'; end if; end $$;
reset role;
-- Callback firmado se persiste como servicio, con el número ya reservado.
set local role service_role;
select public.actualizar_boleta_prueba((select payment_id from public.receipts where number = 7), 'BBB1', 7, 'ERROR');
select public.actualizar_boleta_prueba((select payment_id from public.receipts where number = 7), 'BBB1', 7, 'EMITIDO', 'https://example.test/7.pdf', 'https://example.test/7.xml');
select public.actualizar_boleta_prueba((select payment_id from public.receipts where number = 7), 'BBB1', 7, 'EMITIDO', 'https://example.test/7.pdf', 'https://example.test/7.xml');
do $$ begin
 if (select count(*) from public.receipts) <> 1 then raise exception 'FAIL callback duplicado'; end if;
 begin
   perform public.actualizar_boleta_prueba((select payment_id from public.receipts where number = 7), 'BBB1', 8, 'ERROR');
   raise exception 'FAIL cambió número reservado';
 exception when invalid_parameter_value then null;
 end;
 begin
   perform public.actualizar_boleta_prueba((select payment_id from public.receipts where number = 7), 'BBB1', 7, 'EMITIDO', 'https://example.test/otro.pdf', 'https://example.test/7.xml');
   raise exception 'FAIL sobrescribió boleta emitida';
 exception when invalid_parameter_value then null;
 end;
end $$;
reset role;
-- Otra cuenta para llevar pagada por Stripe, sin tomar correos de Stripe Checkout.
insert into public.orders(id, restaurant_id, branch_id, qr_code_id, modality, total, idempotency_key)
 select '88000000-0000-4000-8000-000000000012', restaurant_id, branch_id, id, 'TAKEAWAY', 32, gen_random_uuid()
 from public.qr_codes where restaurant_id = '10000000-0000-0000-0000-000000000001' and purpose = 'TAKEAWAY' and active;
insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, subtotal)
 select '88000000-0000-4000-8000-000000000012', id, name, 1, 32, 32 from public.products
 where restaurant_id = '10000000-0000-0000-0000-000000000001' and name = 'Ceviche clásico';
set local role service_role;
select * from public.registrar_pago_stripe('cs_test_us088A', 'pi_us088pruebaA', null, '88000000-0000-4000-8000-000000000012', 32, 'stripe@example.test');
select * from public.registrar_pago_stripe('cs_test_us088A', 'pi_us088pruebaA', null, '88000000-0000-4000-8000-000000000012', 32, 'stripe@example.test');
do $$ begin
 if (select count(*) from public.receipts where number = 8 and status = 'PENDIENTE') <> 1 then raise exception 'FAIL reserva Stripe'; end if;
 if (select count(*) from public.payments where stripe_session_id = 'cs_test_us088A') <> 1 then raise exception 'FAIL Stripe duplicado'; end if;
 if (select next_number from public.receipt_series where restaurant_id = '10000000-0000-0000-0000-000000000001') <> 9 then raise exception 'FAIL correlativo Stripe'; end if;
end $$;
reset role;
select 'US-088: verificaciones SQL y RLS locales aprobadas; rollback de todos los datos' as resultado;
rollback;
