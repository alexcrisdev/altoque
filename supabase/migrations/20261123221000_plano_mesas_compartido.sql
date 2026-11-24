begin;

-- Casilla de cada mesa en el plano del local. Vacía usa la distribución inicial.
alter table public.dining_tables
  add column floor_cell integer check (floor_cell >= 0);

-- Se valida al terminar la transacción para poder intercambiar dos mesas.
alter table public.dining_tables
  add constraint dining_tables_floor_cell_unique
  unique (branch_id, floor_cell) deferrable initially deferred;

create function public.guardar_plano_mesas(
  p_local_id uuid, p_posiciones jsonb, p_base jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante uuid;
  v_actual jsonb;
  v_total integer;
begin
  select restaurant_id into v_restaurante
  from public.branches where id = p_local_id;

  if v_restaurante is null
    or not private.has_role(v_restaurante, array['OWNER', 'ADMIN']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_posiciones) is distinct from 'object'
    or jsonb_typeof(p_base) is distinct from 'object' then
    raise exception 'PLANO_INVALIDO' using errcode = '22023';
  end if;

  -- Bloquea el salón para que dos ediciones no se mezclen.
  perform 1 from public.dining_tables
  where branch_id = p_local_id order by id for update;

  select count(*)::integer,
         coalesce(jsonb_object_agg(id::text, floor_cell)
           filter (where floor_cell is not null), '{}'::jsonb)
  into v_total, v_actual
  from public.dining_tables where branch_id = p_local_id;

  if v_actual <> p_base
    or (select count(*) from jsonb_object_keys(p_posiciones)) <> v_total then
    raise exception 'PLANO_CAMBIADO' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_each(p_posiciones) as e
    where jsonb_typeof(e.value) <> 'number'
      or (e.value #>> '{}') !~ '^[0-9]{1,6}$'
      or (e.value #>> '{}')::integer >= greatest(300, v_total * 3)
      or not exists (
        select 1 from public.dining_tables as t
        where t.branch_id = p_local_id and t.id::text = e.key
      )
  ) or (
    select count(distinct e.value) <> count(*)
    from jsonb_each(p_posiciones) as e
  ) then
    raise exception 'PLANO_INVALIDO' using errcode = '22023';
  end if;

  update public.dining_tables as t
  set floor_cell = (p_posiciones ->> t.id::text)::integer
  where t.branch_id = p_local_id;
end;
$$;

revoke all on function public.guardar_plano_mesas(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.guardar_plano_mesas(uuid, jsonb, jsonb)
  to authenticated;

commit;
