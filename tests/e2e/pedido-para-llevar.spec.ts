import { test, prepararCarrito, confirmarYVerificar, TOKEN_MOSTRADOR } from "./ayuda";

test("mostrador → carta → carrito → pedido en cocina y mesero", async ({ page, pedido }) => {
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido);
});
