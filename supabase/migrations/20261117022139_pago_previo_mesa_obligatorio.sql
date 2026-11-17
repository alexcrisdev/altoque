-- Ajuste: el pago antes de cocina es obligatorio para todo pedido hecho por QR,
-- en mesa o para llevar. Deja de ser una opción del restaurante (US-094).
-- Los pedidos que toma el mesero siguen entrando directo a preparación.

begin;

-- La columna se conserva por compatibilidad, pero queda fija en true.
update public.restaurants set prepay_dine_in = true where not prepay_dine_in;
alter table public.restaurants alter column prepay_dine_in set default true;
alter table public.restaurants
  add constraint restaurants_prepay_dine_in_obligatorio check (prepay_dine_in);
comment on column public.restaurants.prepay_dine_in is
  'Obsoleta: el pago previo en mesa es obligatorio (siempre true).';

-- Todo pedido QR nace esperando pago; ya no se consulta el ajuste del restaurante.
create or replace function private.us085_establecer_espera_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'QR' and new.modality in ('TAKEAWAY', 'DINE_IN') then
    new.status := 'PENDING';
  end if;
  return new;
end;
$$;

revoke all on function private.us085_establecer_espera_pago()
  from public, anon, authenticated, service_role;

commit;
