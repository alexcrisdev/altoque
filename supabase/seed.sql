-- Datos de prueba SOLO para desarrollo. Sin información personal real.
-- IDs fijos y fáciles de reconocer para usarlos en pruebas.
-- Los usuarios del personal NO van aquí: se crean con Supabase Auth en US-026.

-- Restaurante y local
insert into public.restaurants (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Cevichería Demo', 'cevicheria-demo');

insert into public.branches (id, restaurant_id, name, address) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Local Centro', 'Av. Ejemplo 123, Lima');

-- Mesas (la 4 está desactivada para probar ese caso)
insert into public.dining_tables (id, restaurant_id, branch_id, number, capacity, active) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 4, true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 4, true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3, 2, true),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, 6, false);

-- QR: se guarda solo la huella SHA-256 del token.
-- Tokens de prueba para abrir /m/<token>: demo-mesa-1, demo-mesa-2, demo-mesa-3, demo-mostrador
-- demo-mesa-4 existe pero está ANULADO (para probar "QR desactivado").
insert into public.qr_codes (restaurant_id, branch_id, dining_table_id, purpose, token_hash, active, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'DINE_IN',
   encode(sha256(convert_to('demo-mesa-1', 'UTF8')), 'hex'), true, null),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'DINE_IN',
   encode(sha256(convert_to('demo-mesa-2', 'UTF8')), 'hex'), true, null),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'DINE_IN',
   encode(sha256(convert_to('demo-mesa-3', 'UTF8')), 'hex'), true, null),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'DINE_IN',
   encode(sha256(convert_to('demo-mesa-4', 'UTF8')), 'hex'), false, now()),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'TAKEAWAY',
   encode(sha256(convert_to('demo-mostrador', 'UTF8')), 'hex'), true, null);

-- Carta
insert into public.categories (id, restaurant_id, name, sort_order) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ceviches',     1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Chicharrones', 2),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Bebidas',      3);

-- "Leche de tigre" está agotado (available = false) para probar ese caso
insert into public.products (restaurant_id, category_id, name, description, price, available) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Ceviche clásico',      'Pescado del día, limón, ají limo y camote', 32.00, true),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Ceviche mixto',        'Pescado y mariscos con leche de tigre',     38.00, true),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Leche de tigre',       'Vaso con chicharrón de pota',               18.00, false),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Chicharrón de pescado','Con yuca frita y salsa criolla',            35.00, true),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Chicharrón de pota',   'Con zarza criolla',                         28.00, true),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'Chicha morada',        'Jarra de 1 litro',                          12.00, true),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'Inca Kola 500 ml',     null,                                         6.00, true);

-- Segundo restaurante para pruebas negativas de acceso entre restaurantes.
insert into public.restaurants (id, name, slug) values
  ('10000000-0000-0000-0000-000000000002', 'Pollería Demo', 'polleria-demo');

insert into public.branches (id, restaurant_id, name, address) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Local Demo', 'Lima');

insert into public.dining_tables (id, restaurant_id, branch_id, number, capacity) values
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1, 4),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 2, 4);

insert into public.categories (id, restaurant_id, name, sort_order) values
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Pollos', 1);

insert into public.products (id, restaurant_id, category_id, name, description, price) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'Pollo a la brasa', 'Pollo entero con papas', 65.00),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'Cuarto de pollo', 'Con papas y ensalada', 22.00);

-- US-005: información alimentaria FICTICIA para pruebas.
-- Estos valores representan registros de un restaurante demo;
-- no describen recetas reales ni garantizan seguridad alimentaria.
-- Ejecutar únicamente después de aplicar la migración de US-005.

update public.products
set ingredients = 'Pescado, limón, ají limo y camote',
    allergens = array['Pescado']::text[]
where restaurant_id = '10000000-0000-0000-0000-000000000001'
  and name = 'Ceviche clásico';

update public.products
set ingredients = 'Pescado, camarones, pota, limón y ají limo',
    allergens = array['Pescado', 'Crustáceos', 'Moluscos']::text[]
where restaurant_id = '10000000-0000-0000-0000-000000000001'
  and name = 'Ceviche mixto';

update public.products
set ingredients = 'Pota, limón y ají limo',
    allergens = array['Moluscos']::text[]
where restaurant_id = '10000000-0000-0000-0000-000000000001'
  and name = 'Leche de tigre';

-- Caso sin información alimentaria configurada.
-- No debe mostrarse como "sin alérgenos".
update public.products
set ingredients = null,
    allergens = '{}'::text[]
where restaurant_id = '10000000-0000-0000-0000-000000000001'
  and name = 'Inca Kola 500 ml';
