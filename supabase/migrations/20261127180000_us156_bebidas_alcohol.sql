-- US-156: datos de bebidas con alcohol en la carta.
-- Migración ADITIVA: dos columnas nuevas y opcionales (null) en products. No borra ni cambia
-- columnas existentes, ni permisos, ni políticas. Los productos actuales quedan con null.
-- La app las pide obligatorias solo en la categoría «Bebidas con alcohol» (validar-producto.ts).
-- Tragos estándar = volume_ml × alcohol_percent / 100 × 0.789 / 10 (src/features/carta/bebidas-alcohol.ts).

begin;

alter table public.products
  add column alcohol_percent numeric(4,1),   -- % de alcohol, con 1 decimal (ej. 5.0)
  add column volume_ml integer;              -- contenido en ml (ej. 620)

alter table public.products
  add constraint products_alcohol_percent_rango check (alcohol_percent between 0 and 100),
  add constraint products_volume_ml_rango check (volume_ml between 1 and 5000);

comment on column public.products.alcohol_percent is 'US-156: % de alcohol (0 a 100). Null si no es bebida con alcohol.';
comment on column public.products.volume_ml is 'US-156: contenido en ml (1 a 5000). Null si no aplica.';

commit;
