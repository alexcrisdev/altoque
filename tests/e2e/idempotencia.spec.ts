import { test, prepararCarrito, confirmarYVerificar, TOKEN_MOSTRADOR } from "./ayuda";

test("dos pulsaciones inmediatas en Confirmar registran un solo pedido", async ({ page, pedido }) => {
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido, true);
});
