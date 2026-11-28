-- US-153: base vectorial para Toqui (opiniones de clientes y manual de uso).
-- Migración ADITIVA: activa pgvector, crea la tabla ai_fragments y 4 funciones. No cambia nada
-- existente. Cada fragmento guarda un texto YA LIMPIO (sin correos, teléfonos ni nombres) y su
-- vector de 384 números (modelo gte-small de Supabase, Edge Function «embeber»).

begin;

create extension if not exists vector with schema extensions;

create table public.ai_fragments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,  -- null = manual (común)
  source text not null check (source in ('REVIEW', 'MANUAL')),
  source_id text not null check (char_length(source_id) between 1 and 100),  -- id de la calificación o sección
  content text not null check (char_length(content) between 1 and 1000),
  service_stars smallint check (service_stars between 1 and 5),   -- solo REVIEW
  waiter_stars smallint check (waiter_stars between 1 and 5),     -- solo REVIEW
  source_date date,                                               -- día de la opinión (hora de Lima)
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  -- Las opiniones siempre son de un restaurante; el manual, de nadie (es común a todos).
  constraint ai_fragments_fuente_restaurante check ((source = 'MANUAL') = (restaurant_id is null)),
  constraint ai_fragments_source_key unique (source, source_id)
);

create index ai_fragments_restaurant_source_idx on public.ai_fragments (restaurant_id, source);
-- Búsqueda por parecido (coseno) con índice HNSW.
create index ai_fragments_embedding_idx on public.ai_fragments
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.ai_fragments enable row level security;

-- Dueño y admin leen las opiniones de SU restaurante.
create policy ai_fragments_read_review on public.ai_fragments
  for select to authenticated
  using (source = 'REVIEW' and (select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

-- El manual lo lee cualquier usuario autenticado del panel (personal activo).
create policy ai_fragments_read_manual on public.ai_fragments
  for select to authenticated
  using (source = 'MANUAL' and exists (
    select 1 from public.staff_memberships sm
    where sm.user_id = (select auth.uid()) and sm.active
  ));

-- Nadie escribe desde el navegador: solo el servidor, con las funciones de abajo.
revoke all on public.ai_fragments from public, anon, authenticated;
grant select on public.ai_fragments to authenticated;

-- Comentarios de calificaciones que aún no tienen fragmento (máximo 50 por vez). Devuelve los
-- nombres del personal y del cliente SOLO para que el servidor los tape antes de guardar: nunca
-- se guardan. No incluye pedidos de prueba (misma regla que US-111).
create function public.comentarios_sin_indexar_ia(p_restaurante uuid, p_limite integer default 50)
returns table (rating_id uuid, comentario text, service_stars smallint, waiter_stars smallint, fecha date, nombres text[])
language sql
stable
security definer
set search_path = ''
as $$
  with prueba as (
    select array_agg(prefijo || '%') as patrones from unnest(private.prefijos_pedido_prueba()) as prefijo
  ), personal as (
    select coalesce(array_agg(u.full_name), '{}') as nombres
    from public.staff_memberships sm join public.users u on u.id = sm.user_id
    where sm.restaurant_id = p_restaurante
  )
  select r.id, r.comment, r.service_stars, r.waiter_stars,
         (r.created_at at time zone 'America/Lima')::date,
         array_remove(array_append(personal.nombres, o.customer_name), null)
  from public.order_ratings r
  join public.orders o on o.id = r.order_id and o.restaurant_id = r.restaurant_id
  cross join prueba cross join personal
  where r.restaurant_id = p_restaurante
    and r.comment is not null and btrim(r.comment) <> ''
    and not coalesce(o.customer_name like any (prueba.patrones), false)
    and not exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and oi.observation like any (prueba.patrones)
    )
    and not exists (
      select 1 from public.ai_fragments f where f.source = 'REVIEW' and f.source_id = r.id::text
    )
  order by r.created_at desc
  limit least(greatest(coalesce(p_limite, 50), 1), 50);
$$;

-- Guarda (o actualiza) fragmentos. p_fragmentos es una lista JSON de hasta 50 objetos:
-- { restaurant_id, source, source_id, content, service_stars, waiter_stars, source_date, embedding }
-- con embedding como texto "[0.1,0.2,...]". Una opinión solo se guarda en el restaurante de su
-- calificación. Devuelve cuántos guardó.
create function public.guardar_fragmentos_ia(p_fragmentos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f jsonb;
  v_restaurante uuid;
  v_fuente text;
  v_guardados integer := 0;
begin
  if jsonb_typeof(p_fragmentos) is distinct from 'array' or jsonb_array_length(p_fragmentos) > 50 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  for v_f in select * from jsonb_array_elements(p_fragmentos) loop
    v_fuente := v_f->>'source';
    v_restaurante := nullif(v_f->>'restaurant_id', '')::uuid;
    if v_fuente = 'REVIEW' and not exists (
      select 1 from public.order_ratings r
      where r.id::text = v_f->>'source_id' and r.restaurant_id = v_restaurante
    ) then
      raise exception 'RATING_NOT_FOUND' using errcode = '22023';
    end if;

    insert into public.ai_fragments
      (restaurant_id, source, source_id, content, service_stars, waiter_stars, source_date, embedding)
    values (
      v_restaurante, v_fuente, v_f->>'source_id', v_f->>'content',
      nullif(v_f->>'service_stars', '')::smallint, nullif(v_f->>'waiter_stars', '')::smallint,
      nullif(v_f->>'source_date', '')::date, (v_f->>'embedding')::extensions.vector(384)
    )
    on conflict (source, source_id) do update set
      content = excluded.content,
      service_stars = excluded.service_stars,
      waiter_stars = excluded.waiter_stars,
      source_date = excluded.source_date,
      embedding = excluded.embedding
    where public.ai_fragments.restaurant_id is not distinct from excluded.restaurant_id;
    v_guardados := v_guardados + 1;
  end loop;
  return v_guardados;
end;
$$;

-- Borra las secciones del manual que ya no existen (el script manda las vigentes).
create function public.podar_manual_ia(p_vigentes text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with borrados as (
    delete from public.ai_fragments
    where source = 'MANUAL' and not (source_id = any (coalesce(p_vigentes, '{}')))
    returning 1
  )
  select count(*)::integer from borrados;
$$;

-- Los fragmentos más parecidos a una pregunta, con su similitud (1 = idéntico). Las opiniones
-- SIEMPRE se filtran por restaurante; el manual es común. Máximo 20 resultados.
create function public.buscar_fragmentos_ia(
  p_restaurante uuid,
  p_fuente text,
  p_embedding extensions.vector(384),
  p_cantidad integer default 10,
  p_similitud_minima double precision default 0
)
returns table (
  id uuid, source_id text, content text, service_stars smallint, waiter_stars smallint,
  source_date date, similitud double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.source_id, f.content, f.service_stars, f.waiter_stars, f.source_date,
         1 - (f.embedding operator(extensions.<=>) p_embedding) as similitud
  from public.ai_fragments f
  where f.source = p_fuente
    and (
      (p_fuente = 'REVIEW' and p_restaurante is not null and f.restaurant_id = p_restaurante)
      or (p_fuente = 'MANUAL' and f.restaurant_id is null)
    )
    and 1 - (f.embedding operator(extensions.<=>) p_embedding) >= coalesce(p_similitud_minima, 0)
  order by f.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(coalesce(p_cantidad, 10), 1), 20);
$$;

revoke all on function public.comentarios_sin_indexar_ia(uuid, integer) from public, anon, authenticated;
revoke all on function public.guardar_fragmentos_ia(jsonb) from public, anon, authenticated;
revoke all on function public.podar_manual_ia(text[]) from public, anon, authenticated;
revoke all on function public.buscar_fragmentos_ia(uuid, text, extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.comentarios_sin_indexar_ia(uuid, integer) to service_role;
grant execute on function public.guardar_fragmentos_ia(jsonb) to service_role;
grant execute on function public.podar_manual_ia(text[]) to service_role;
grant execute on function public.buscar_fragmentos_ia(uuid, text, extensions.vector, integer, double precision) to service_role;

commit;
