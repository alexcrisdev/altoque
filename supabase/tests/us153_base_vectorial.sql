-- US-153: RLS y búsqueda de la base vectorial. Solo supabase_db_altoque local; todo en una
-- transacción con rollback (no deja datos). Vectores de prueba de 384 números.
begin;
select set_config('us153.caso', :'caso', true);

-- e1 = (1, 0, 0, ...) ; e2 = (0.8, 0.6, 0, ...) ; e3 = (0, 1, 0, ...). coseno(e1, e2) = 0.8
-- Se guardan como texto en ajustes de la transacción: cualquier rol los puede leer.
select set_config('us153.e1', '[' || array_to_string(array_cat(array[1.0, 0.0]::float8[], array_fill(0.0::float8, array[382])), ',') || ']', true);
select set_config('us153.e2', '[' || array_to_string(array_cat(array[0.8, 0.6]::float8[], array_fill(0.0::float8, array[382])), ',') || ']', true);
select set_config('us153.e3', '[' || array_to_string(array_cat(array[0.0, 1.0]::float8[], array_fill(0.0::float8, array[382])), ',') || ']', true);

-- Cevichería Demo (A) y Pollería Demo (B), del seed.
insert into public.ai_fragments (restaurant_id, source, source_id, content, embedding)
values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'REVIEW', 'us153-a1', 'Esperé 40 minutos', current_setting('us153.e1')::extensions.vector),
  ('10000000-0000-0000-0000-000000000001'::uuid, 'REVIEW', 'us153-a2', 'La comida llegó fría', current_setting('us153.e2')::extensions.vector),
  ('10000000-0000-0000-0000-000000000001'::uuid, 'REVIEW', 'us153-a3', 'Todo muy rico', current_setting('us153.e3')::extensions.vector),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'REVIEW', 'us153-b1', 'Pollo seco', current_setting('us153.e1')::extensions.vector),
  (null, 'MANUAL', 'manual:us153-prueba', 'Mesas y QR', current_setting('us153.e1')::extensions.vector);

do $$
declare
  c text := current_setting('us153.caso');
  n integer;
  ids text[];
begin
  if c in ('rls_admin', 'rls_otro', 'rls_mesero', 'escritura', 'funciones') then
    perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = case c
      when 'rls_otro' then 'dueno@polleria.demo'
      when 'rls_mesero' then 'mesero@demo.altoque.pe'
      else 'admin@demo.altoque.pe' end), true);
    set local role authenticated;
  end if;

  if c = 'rls_admin' then
    select array_agg(source_id order by source_id) into ids from public.ai_fragments where source_id like 'us153-%';
    if ids is distinct from array['us153-a1', 'us153-a2', 'us153-a3'] then raise exception 'Admin ve opiniones ajenas o le faltan: %', ids; end if;
    if not exists (select 1 from public.ai_fragments where source_id = 'manual:us153-prueba') then raise exception 'Admin no ve el manual'; end if;

  elsif c = 'rls_otro' then
    select array_agg(source_id) into ids from public.ai_fragments where source_id like 'us153-%';
    if ids is distinct from array['us153-b1'] then raise exception 'Otro restaurante ve opiniones ajenas: %', ids; end if;

  elsif c = 'rls_mesero' then
    select count(*) into n from public.ai_fragments where source = 'REVIEW';
    if n <> 0 then raise exception 'El mesero lee opiniones'; end if;
    if not exists (select 1 from public.ai_fragments where source_id = 'manual:us153-prueba') then raise exception 'El mesero no ve el manual'; end if;

  elsif c = 'escritura' then
    begin
      insert into public.ai_fragments (restaurant_id, source, source_id, content, embedding)
      values ('10000000-0000-0000-0000-000000000001', 'REVIEW', 'us153-x', 'x', current_setting('us153.e1')::extensions.vector);
      raise exception 'El navegador pudo escribir';
    exception when insufficient_privilege then null;
    end;

  elsif c = 'funciones' then
    begin
      perform public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000001', 'REVIEW', current_setting('us153.e1')::extensions.vector, 10, 0);
      raise exception 'Un usuario del panel pudo usar la búsqueda de servicio';
    exception when insufficient_privilege then null;
    end;

  elsif c = 'anonimo' then
    set local role anon;
    begin
      perform 1 from public.ai_fragments limit 1;
      raise exception 'Anónimo pudo leer fragmentos';
    exception when insufficient_privilege then null;
    end;

  elsif c = 'busqueda' then
    set local role service_role;
    -- Ordena por parecido y nunca mezcla restaurantes.
    select array_agg(source_id order by similitud desc) into ids
      from public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000001', 'REVIEW', current_setting('us153.e1')::extensions.vector, 10, 0);
    if ids is distinct from array['us153-a1', 'us153-a2', 'us153-a3'] then raise exception 'Orden o filtro incorrecto: %', ids; end if;
    if (select round(similitud::numeric, 3) from public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000001', 'REVIEW', current_setting('us153.e1')::extensions.vector, 10, 0) where source_id = 'us153-a2') <> 0.800 then
      raise exception 'Similitud incorrecta';
    end if;
    -- Similitud mínima y cantidad.
    select count(*) into n from public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000001', 'REVIEW', current_setting('us153.e1')::extensions.vector, 10, 0.9);
    if n <> 1 then raise exception 'No respetó la similitud mínima: %', n; end if;
    select count(*) into n from public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000001', 'REVIEW', current_setting('us153.e1')::extensions.vector, 1, 0);
    if n <> 1 then raise exception 'No respetó la cantidad: %', n; end if;
    -- Sin restaurante no hay opiniones; el manual es común.
    select count(*) into n from public.buscar_fragmentos_ia(null, 'REVIEW', current_setting('us153.e1')::extensions.vector, 10, 0);
    if n <> 0 then raise exception 'Devolvió opiniones sin restaurante'; end if;
    select array_agg(source_id) into ids from public.buscar_fragmentos_ia('10000000-0000-0000-0000-000000000002', 'MANUAL', current_setting('us153.e1')::extensions.vector, 10, 0);
    if not ('manual:us153-prueba' = any (ids)) then raise exception 'No encontró el manual'; end if;

  elsif c = 'guardar' then
    set local role service_role;
    begin
      perform public.guardar_fragmentos_ia(jsonb_build_array(jsonb_build_object(
        'restaurant_id', '10000000-0000-0000-0000-000000000001', 'source', 'REVIEW',
        'source_id', gen_random_uuid()::text, 'content', 'x', 'embedding', current_setting('us153.e1'))));
      raise exception 'Guardó una opinión sin calificación de ese restaurante';
    exception when invalid_parameter_value then
      if sqlerrm <> 'RATING_NOT_FOUND' then raise; end if;
    end;
    perform public.guardar_fragmentos_ia(jsonb_build_array(jsonb_build_object(
      'restaurant_id', null, 'source', 'MANUAL', 'source_id', 'manual:us153-nueva', 'content', 'Nueva', 'embedding', current_setting('us153.e2'))));
    if not exists (select 1 from public.ai_fragments where source_id = 'manual:us153-nueva') then raise exception 'No guardó el manual'; end if;
    perform public.podar_manual_ia(array['manual:us153-nueva']);
    if exists (select 1 from public.ai_fragments where source_id = 'manual:us153-prueba') then raise exception 'No borró la sección vieja'; end if;
  end if;
end $$;

select 'US-153: caso aprobado' as resultado;
rollback;
