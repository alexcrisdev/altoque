import { test, expect } from "@playwright/test";

test("QR anulado no permite pedir", async ({ page }) => {
  await page.goto("/m/demo-mesa-4");
  await expect(page.getByText("Mesa no disponible", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
});

test("token inventado informa QR no válido", async ({ page }) => {
  await page.goto("/m/prueba-e2e-token-inexistente-040");
  await expect(page.getByText("Código QR no válido", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
});
