-- US-028: aislamiento por restaurante y permisos del personal.
-- El esquema private no se expone por la API de Supabase.
create schema if not exists private;

create or replace function private.is_member(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_memberships as sm
    where sm.restaurant_id = p_restaurant
      and sm.user_id = (select auth.uid())
      and sm.active
  );
$$;

create or replace function private.has_role(p_restaurant uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_memberships as sm
    join public.roles as r on r.id = sm.role_id
    where sm.restaurant_id = p_restaurant
      and sm.user_id = (select auth.uid())
      and sm.active
      and r.code = any (p_roles)
  );
$$;

-- Evita que la política de perfiles dependa de políticas recursivas en memberships.
create or replace function private.shares_restaurant(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_memberships as mine
    join public.staff_memberships as colleague
      on colleague.restaurant_id = mine.restaurant_id
    where mine.user_id = (select auth.uid())
      and mine.active
      and colleague.user_id = p_user
      and colleague.active
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_role(uuid, text[]) from public, anon;
revoke all on function private.shares_restaurant(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, text[]) to authenticated;
grant execute on function private.shares_restaurant(uuid) to authenticated;

create policy restaurants_read_member on public.restaurants
  for select to authenticated
  using ((select private.is_member(id)));
create policy restaurants_update_admin on public.restaurants
  for update to authenticated
  using ((select private.has_role(id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(id, array['OWNER', 'ADMIN'])));
create policy restaurants_delete_admin on public.restaurants
  for delete to authenticated
  using ((select private.has_role(id, array['OWNER'])));

create policy branches_read_member on public.branches
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy branches_insert_admin on public.branches
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy branches_update_admin on public.branches
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy branches_delete_admin on public.branches
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create policy dining_tables_read_member on public.dining_tables
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy dining_tables_insert_admin on public.dining_tables
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy dining_tables_update_admin on public.dining_tables
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy dining_tables_delete_admin on public.dining_tables
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create policy qr_codes_read_member on public.qr_codes
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy qr_codes_insert_admin on public.qr_codes
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy qr_codes_update_admin on public.qr_codes
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy qr_codes_delete_admin on public.qr_codes
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create policy categories_read_member on public.categories
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy categories_insert_admin on public.categories
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy categories_update_admin on public.categories
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy categories_delete_admin on public.categories
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create policy products_read_member on public.products
  for select to authenticated
  using ((select private.is_member(restaurant_id)));
create policy products_insert_admin on public.products
  for insert to authenticated
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy products_update_admin on public.products
  for update to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])))
  with check ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));
create policy products_delete_admin on public.products
  for delete to authenticated
  using ((select private.has_role(restaurant_id, array['OWNER', 'ADMIN'])));

create policy roles_read_authenticated on public.roles
  for select to authenticated using (true);

create policy users_read_self_or_colleague on public.users
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_restaurant(id)));
create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy staff_memberships_read_self_or_admin on public.staff_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_role(restaurant_id, array['OWNER', 'ADMIN']))
  );
create policy staff_memberships_insert_admin on public.staff_memberships
  for insert to authenticated
  with check (
    (select private.has_role(restaurant_id, array['OWNER']))
    or (
      (select private.has_role(restaurant_id, array['ADMIN']))
      and role_id <> (select id from public.roles where code = 'OWNER')
    )
  );
create policy staff_memberships_update_admin on public.staff_memberships
  for update to authenticated
  using (
    (select private.has_role(restaurant_id, array['OWNER']))
    or (
      (select private.has_role(restaurant_id, array['ADMIN']))
      and role_id <> (select id from public.roles where code = 'OWNER')
    )
  )
  with check (
    (select private.has_role(restaurant_id, array['OWNER']))
    or (
      (select private.has_role(restaurant_id, array['ADMIN']))
      and role_id <> (select id from public.roles where code = 'OWNER')
    )
  );
create policy staff_memberships_delete_admin on public.staff_memberships
  for delete to authenticated
  using (
    (select private.has_role(restaurant_id, array['OWNER']))
    or (
      (select private.has_role(restaurant_id, array['ADMIN']))
      and role_id <> (select id from public.roles where code = 'OWNER')
    )
  );
