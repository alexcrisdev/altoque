-- US-068: publicar cambios de pedidos para avisar al mesero en tiempo real.
-- La tabla conserva RLS y sus políticas orders_read_member existentes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end;
$$;
