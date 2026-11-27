-- Plano: forma y número de sillas de cada mesa.
-- Regla: 1 a 4 sillas = 1 mesa; 5 o 6 = 2 mesas juntas; 7 u 8 = 3 mesas juntas. Máximo 8.
-- Las mesas juntas son solo el dibujo: en la base sigue siendo UNA mesa,
-- con un número, un QR y una cuenta. No borra ni renombra columnas y no cambia permisos.

-- Las mesas actuales quedan redondas: se ven igual que antes.
alter table public.dining_tables
  add column shape text not null default 'ROUND'
    constraint dining_tables_shape_check check (shape in ('ROUND', 'SQUARE'));

-- capacity sigue pudiendo ser null (se dibuja con 4 sillas).
alter table public.dining_tables
  add constraint dining_tables_capacity_1_8 check (capacity between 1 and 8) not valid;

-- Se valida solo si ninguna mesa actual supera 8; si alguna lo hace, la regla aplica
-- a los cambios nuevos y se avisa para revisarla a mano (el db push no falla).
-- Ojo: mientras esa mesa tenga más de 8, cualquier cambio a ESA fila (moverla en el plano,
-- activarla o desactivarla) falla hasta que se le pongan de 1 a 8 sillas.
do $$
begin
  if not exists (select 1 from public.dining_tables where capacity > 8) then
    alter table public.dining_tables validate constraint dining_tables_capacity_1_8;
  else
    raise notice 'Hay mesas con más de 8 sillas: revisar a mano.';
  end if;
end;
$$;
