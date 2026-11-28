-- US-151: conteo de consultas a la IA (Claude) para proteger el saldo.
-- Migración ADITIVA: una tabla y una función nuevas. No cambia nada existente.
-- NUNCA se guarda el texto de las preguntas ni de las respuestas: solo quién, cuándo,
-- para qué HU y cuántos tokens.

begin;

create table public.ai_usage (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- null = cliente sin cuenta
  usage_date date not null default ((now() at time zone 'America/Lima')::date),  -- día en hora de Lima
  created_at timestamptz not null default now(),
  feature text not null check (feature ~ '^[a-z0-9-]{1,40}$'),    -- código de la HU, ej. resumen-dashboard
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0)
);

create index ai_usage_restaurant_date_idx on public.ai_usage (restaurant_id, usage_date);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at) where user_id is not null;

alter table public.ai_usage enable row level security;

-- Dueño y admin ven el consumo de SU restaurante. Nadie escribe desde el navegador:
-- solo el servidor, con reservar_consulta_ia y la cuenta de servicio.
create policy ai_usage_read_owner_admin on public.ai_usage
  for select to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Revisa el límite y, si hay cupo, anota la consulta en el mismo paso (dos consultas a la
-- vez no pueden pasarse del límite). Devuelve 'OK' con el id de la fila, o el límite que
-- se alcanzó con id null. Los límites llegan desde src/features/ia/reglas.ts.
create function public.reservar_consulta_ia(
  p_restaurante uuid,
  p_usuario uuid,
  p_funcion text,
  p_limite_usuario_hora integer,
  p_limite_restaurante_dia integer
)
returns table (resultado text, uso_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_id bigint;
begin
  if p_restaurante is null or p_funcion is null
     or coalesce(p_limite_usuario_hora, 0) < 1 or coalesce(p_limite_restaurante_dia, 0) < 1 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- Una consulta a la vez por restaurante mientras se cuenta.
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_restaurante::text, 0));

  if (select count(*) from public.ai_usage u
      where u.restaurant_id = p_restaurante and u.usage_date = v_hoy) >= p_limite_restaurante_dia then
    return query select 'LIMITE_RESTAURANTE'::text, null::bigint;
    return;
  end if;

  if p_usuario is not null and (select count(*) from public.ai_usage u
      where u.user_id = p_usuario and u.created_at > now() - interval '1 hour') >= p_limite_usuario_hora then
    return query select 'LIMITE_USUARIO'::text, null::bigint;
    return;
  end if;

  insert into public.ai_usage (restaurant_id, user_id, feature)
  values (p_restaurante, p_usuario, p_funcion)
  returning id into v_id;

  return query select 'OK'::text, v_id;
end;
$$;

revoke all on function public.reservar_consulta_ia(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_consulta_ia(uuid, uuid, text, integer, integer) to service_role;

commit;
