import { test, prepararCarrito, confirmarYVerificar, TOKEN_MOSTRADOR } from "./ayuda";
import { pagarParaLlevarEnCaja, prepararRecuperacion } from "./pago-ayuda";

test("US-085: mostrador → esperando pago → caja → cocina y mesero", async ({ page, pedido }) => {
  prepararRecuperacion(pedido);
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido);
  await pagarParaLlevarEnCaja(pedido);
});
