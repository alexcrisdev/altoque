-- Plano: forma y número de sillas de cada mesa.
-- Las mesas juntas (5 a 12 sillas) son solo el dibujo: en la base sigue siendo UNA mesa,
-- con un número, un QR y una cuenta. No borra ni renombra columnas y no cambia permisos.

-- Las mesas actuales quedan redondas: se ven igual que antes.
alter table public.dining_tables
  add column shape text not null default 'ROUND'
    constraint dining_tables_shape_check check (shape in ('ROUND', 'SQUARE'));

-- capacity sigue pudiendo ser null (se dibuja con 4 sillas).
alter table public.dining_tables
  add constraint dining_tables_capacity_1_12 check (capacity between 1 and 12) not valid;

-- Se valida solo si ninguna mesa actual supera 12; si alguna lo hace, la regla aplica
-- a los cambios nuevos y se avisa para revisarla a mano (el db push no falla).
do $$
begin
  if not exists (select 1 from public.dining_tables where capacity > 12) then
    alter table public.dining_tables validate constraint dining_tables_capacity_1_12;
  else
    raise notice 'Hay mesas con más de 12 sillas: revisar a mano.';
  end if;
end;
$$;
