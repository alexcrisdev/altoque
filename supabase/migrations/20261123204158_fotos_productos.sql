begin;

-- Las imágenes se leen desde la carta pública. Solo el personal autorizado puede subirlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-productos', 'fotos-productos', true, 819200,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy fotos_productos_insertar on storage.objects
for insert to authenticated with check (
  bucket_id = 'fotos-productos'
  and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
           and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER', 'ADMIN'])
    else false end
);

-- Permiten retirar una subida si no se pudo guardar el producto.
create policy fotos_productos_leer_propias on storage.objects
for select to authenticated using (
  bucket_id = 'fotos-productos' and owner_id = (select auth.uid())::text
);

create policy fotos_productos_borrar_propias on storage.objects
for delete to authenticated using (
  bucket_id = 'fotos-productos' and owner_id = (select auth.uid())::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER', 'ADMIN'])
    else false end
);

commit;
