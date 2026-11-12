-- Estas funciones son internas y solo deben ejecutarse desde sus envoltorios,
-- que adquieren los bloqueos advisory antes de operar con los pedidos.
revoke execute on function public.registrar_pedido_mesero_sin_bloqueo_stock(
  uuid, text, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;

revoke execute on function public.modificar_pedido_sin_bloqueo_stock(
  uuid, jsonb, text
) from public, anon, authenticated;
