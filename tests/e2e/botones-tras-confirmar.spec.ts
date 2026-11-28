import { expect } from "@playwright/test";
import { test, MESA_NUMERO, TOKEN_MESA, prepararCarrito } from "./ayuda";

test.setTimeout(150_000);

// US-127: tras confirmar, el cliente toca «Ver el estado de mi pedido» DENTRO del carrito (como
// lo hace una persona). Antes el carrito seguía abierto en la página oculta y la pantalla de
// estado quedaba inerte hasta recargar. Ahora sus botones responden sin recargar.
test("US-127: después de confirmar, los botones de la pantalla de estado responden sin recargar", async ({ page, pedido }) => {
  expect(MESA_NUMERO, "Solo usa la mesa reservada para E2E").toBe(5);
  await pedido.abrirMesa();
  const carrito = await prepararCarrito(page, TOKEN_MESA, pedido);
  await carrito.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await expect(carrito.getByText(/^Tu número de pedido es \d+$/)).toBeVisible({ timeout: 30_000 });

  // El enlace del pie del carrito (dentro del diálogo), sin cerrarlo antes.
  await carrito.getByRole("link", { name: "Ver el estado de mi pedido", exact: true }).click();
  await expect(page).toHaveURL(/\/pedido\//);
  await expect(page.getByText("Esperando pago", { exact: true })).toBeVisible();

  // Ningún diálogo modal quedó abierto (ni en la página oculta).
  expect(await page.evaluate(() => document.querySelectorAll("dialog[open]").length)).toBe(0);

  // «Pagar en caja» responde: abre su diálogo y «No» lo cierra.
  const pagarEnCaja = page.getByRole("button", { name: "Pagar en caja", exact: true });
  await expect(pagarEnCaja).toBeEnabled();
  await pagarEnCaja.click();
  const dialogo = page.getByRole("dialog", { name: "¿Quieres pagar en caja?" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "No", exact: true }).click();
  await expect(dialogo).not.toBeVisible();

  // Los demás botones visibles de la pantalla también reciben el toque (no hay capa encima).
  for (const boton of await page.getByRole("button").filter({ visible: true }).all()) {
    await boton.click({ trial: true, timeout: 5_000 }); // «trial»: comprueba que se puede tocar sin ejecutarlo
  }
});
