import { test, prepararCarrito, confirmarYVerificar, MESA_NUMERO, TOKEN_MESA } from "./ayuda";

test(`Mesa ${MESA_NUMERO} → abrir sesión → pedido en cocina y mesero → limpiar`, async ({ page, pedido }) => {
  await pedido.abrirMesa();
  await prepararCarrito(page, TOKEN_MESA, pedido.marca);
  await confirmarYVerificar(page, pedido);
});
