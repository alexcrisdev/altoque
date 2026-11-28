import { expect } from "@playwright/test";
import { test, MESA_NUMERO, TOKEN_MESA, confirmarYVerificar } from "./ayuda";

test.setTimeout(150_000);

// US-036: con la mesa cerrada el cliente arma su carrito (y no lo pierde si recarga); cuando el
// mesero habilita la mesa, aparece el aviso y confirma SIN recargar, con el carrito intacto.
test("US-036: el cliente confirma su pedido cuando el mesero habilita la mesa, sin recargar", async ({ page, pedido }) => {
  expect(MESA_NUMERO, "Solo usa la mesa reservada para E2E").toBe(5);
  const producto = await pedido.prepararStock();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${TOKEN_MESA}`);
  await expect(page.getByRole("heading", { name: `Mesa ${MESA_NUMERO}`, exact: true })).toBeVisible();
  await expect(page.getByText("Pide al mesero que habilite tu mesa.")).toBeVisible();

  await test.step("con la mesa cerrada puede elegir platos, pero no confirmar", async () => {
    const tarjeta = page.getByRole("button", { name: /S\// }).filter({ has: page.getByText(producto.name, { exact: true }) });
    await tarjeta.click();
    const detalle = page.getByRole("dialog");
    await detalle.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await detalle.getByRole("button", { name: "Cerrar detalle", exact: true }).click();
    await page.getByRole("button", { name: /^Ver carrito:/ }).click();
    const carrito = page.getByRole("dialog", { name: "Tu carrito" });
    await carrito.getByLabel(/^Observaciones para/).fill(pedido.marca);
    await expect(carrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); // cierra el carrito (diálogo nativo)
  });

  await test.step("si recarga, no pierde lo elegido", async () => {
    await page.reload();
    await page.getByRole("button", { name: /^Ver carrito:/ }).click();
    const carrito = page.getByRole("dialog", { name: "Tu carrito" });
    await expect(carrito.getByText(producto.name, { exact: true })).toBeVisible();
    await expect(carrito.getByLabel(/^Observaciones para/)).toHaveValue(pedido.marca);
    await page.keyboard.press("Escape");
  });

  // El mesero abre la sesión desde su panel (otra pestaña con su cuenta).
  await pedido.abrirMesa();

  await test.step("aparece el aviso y confirma sin recargar", async () => {
    await expect(page.getByText("¡Tu mesa ya está habilitada!")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Ver carrito:/ }).click();
    const carrito = page.getByRole("dialog", { name: "Tu carrito" });
    await expect(carrito.getByText(producto.name, { exact: true })).toBeVisible();
    await carrito.getByRole("button", { name: "No", exact: true }).click();
    await expect(carrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeEnabled();
    await confirmarYVerificar(page, pedido);
  });

  await test.step("al confirmar, el carrito guardado se limpia", async () => {
    const guardado = await page.evaluate((token) => sessionStorage.getItem(`altoque:carrito:${token}`), TOKEN_MESA);
    expect(guardado).toBeNull();
  });
});
