-- Ejecutar con `npx supabase test db` en Supabase LOCAL después de las migraciones.
-- Fixtures propias; todos los cambios se revierten al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.restaurants (id, name, slug) values
  ('69000000-0000-0000-0000-000000000001', 'Prueba US-069', 'prueba-us069');
insert into public.branches (id, restaurant_id, name) values
  ('69000000-0000-0000-0000-000000000002', '69000000-0000-0000-0000-000000000001', 'Local');
insert into auth.users (id) values
  ('69000000-0000-0000-0000-000000000003'),
  ('69000000-0000-0000-0000-000000000004');
insert into public.users (id, full_name) values
  ('69000000-0000-0000-0000-000000000003', 'Cocina US-069'),
  ('69000000-0000-0000-0000-000000000004', 'Mesero US-069');
insert into public.staff_memberships (user_id, restaurant_id, role_id)
select '69000000-0000-0000-0000-000000000003', '69000000-0000-0000-0000-000000000001', id
from public.roles where code = 'KITCHEN';
insert into public.staff_memberships (user_id, restaurant_id, role_id)
select '69000000-0000-0000-0000-000000000004', '69000000-0000-0000-0000-000000000001', id
from public.roles where code = 'WAITER';
insert into public.orders (id, restaurant_id, branch_id, modality, total, idempotency_key, source, created_by)
values ('69000000-0000-0000-0000-000000000005', '69000000-0000-0000-0000-000000000001',
  '69000000-0000-0000-0000-000000000002', 'TAKEAWAY', 10, gen_random_uuid(), 'WAITER',
  '69000000-0000-0000-0000-000000000004');

select is((select status from public.orders where id = '69000000-0000-0000-0000-000000000005'),
  'IN_PROGRESS', 'El valor por defecto es IN_PROGRESS');
select is((select to_status from public.order_status_history where order_id = '69000000-0000-0000-0000-000000000005'),
  'IN_PROGRESS', 'El trigger registra el estado inicial');

set local role authenticated;
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000003', true);
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'READY'), 'READY', 'Cocina marca listo');
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'IN_PROGRESS'), 'IN_PROGRESS', 'Cocina deshace inmediatamente');
select is((select ready_at from public.orders where id = '69000000-0000-0000-0000-000000000005'),
  null::timestamptz, 'Deshacer limpia la fecha de listo');
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'READY'), 'READY', 'Puede volver a marcar listo');

-- Ajustar solo el reloj del fixture como postgres; invocar siempre con rol normal.
reset role;
update public.orders set ready_at = clock_timestamp() - interval '4 minutes 30 seconds'
where id = '69000000-0000-0000-0000-000000000005';
set local role authenticated;
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'IN_PROGRESS'), 'IN_PROGRESS', 'Permite deshacer antes de cinco minutos');
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'READY'), 'READY', 'Nueva entrada a listo reinicia el plazo');
reset role;
update public.orders set ready_at = clock_timestamp() - interval '5 minutes 1 second'
where id = '69000000-0000-0000-0000-000000000005';
set local role authenticated;
select throws_ok($$select public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'IN_PROGRESS')$$,
  '22023', 'UNDO_EXPIRED', 'Rechaza deshacer después de cinco minutos');
select is((select status from public.orders where id = '69000000-0000-0000-0000-000000000005'), 'READY', 'El rechazo conserva READY');
reset role;
update public.orders set ready_at = null where id = '69000000-0000-0000-0000-000000000005';
set local role authenticated;
select throws_ok($$select public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'IN_PROGRESS')$$,
  '22023', 'UNDO_EXPIRED', 'No deshace un listo sin fecha verificable');
reset role;
update public.orders set ready_at = clock_timestamp() where id = '69000000-0000-0000-0000-000000000005';
set local role authenticated;
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'IN_PROGRESS'), 'IN_PROGRESS', 'Recupera preparación para probar cancelación');
select throws_ok($$select public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'CANCELLED', 'Sin permiso')$$,
  '42501', 'FORBIDDEN', 'Cocina no puede cancelar');
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000004', true);
select throws_ok($$select public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'CANCELLED', '  ')$$,
  '22023', 'REASON_REQUIRED', 'Mesero debe indicar motivo');
select throws_ok($$select public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'CANCELLED', repeat('x', 201))$$,
  '22023', 'INVALID_REASON', 'Limita el motivo a 200 caracteres');
select is(public.cambiar_estado_pedido('69000000-0000-0000-0000-000000000005', 'CANCELLED', 'US-069: prueba'),
  'CANCELLED', 'Mesero cancela en preparación con motivo');
reset role;
select is((select reason from public.order_status_history where order_id = '69000000-0000-0000-0000-000000000005' and to_status = 'CANCELLED'),
  'US-069: prueba', 'Conserva el motivo en el historial');
select is((select changed_by from public.order_status_history where order_id = '69000000-0000-0000-0000-000000000005' and to_status = 'CANCELLED'),
  '69000000-0000-0000-0000-000000000004'::uuid, 'Conserva al mesero como autor');
select * from finish();
rollback;
