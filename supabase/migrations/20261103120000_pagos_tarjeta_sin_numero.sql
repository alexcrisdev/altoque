-- US-024: pagos con tarjeta mediante un POS externo.
-- registrar_pago ya acepta CARD desde US-022 (referencia + aprobado/rechazado).
-- Aquí solo se asegura que nunca se guarde un número de tarjeta como referencia:
-- un número de tarjeta tiene de 13 a 19 dígitos, así que se rechaza cualquier
-- referencia con 13 o más dígitos seguidos (sin contar guiones). Las referencias
-- del voucher y los códigos de autorización son más cortos. El CVV no tiene
-- columna donde guardarse.
alter table public.payments
  add constraint payments_reference_sin_tarjeta
  check (reference is null or regexp_replace(reference, '-', '', 'g') !~ '[0-9]{13,}');
