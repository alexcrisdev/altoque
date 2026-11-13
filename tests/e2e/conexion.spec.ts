import { expect } from "@playwright/test";
import { test, prepararCarrito, confirmarYVerificar, pedidosPropios, TOKEN_MOSTRADOR } from "./ayuda";
import { pagarParaLlevarEnCaja, prepararRecuperacion } from "./pago-ayuda";

test("CP-030-05: sin conexión conserva el carrito y reintenta sin duplicar", async ({ page, pedido }) => {
  prepararRecuperacion(pedido);
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  try {
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /conexión/ })).toBeVisible();
    await expect(page.getByLabel(/^Observaciones para/)).toHaveValue(pedido.marca);
    expect(await pedidosPropios(pedido.admin, pedido.marca)).toHaveLength(0);
  } finally { await page.context().setOffline(false); }
  await confirmarYVerificar(page, pedido);
  expect(await pedidosPropios(pedido.admin, pedido.marca)).toHaveLength(1);
  await pagarParaLlevarEnCaja(pedido);
});
