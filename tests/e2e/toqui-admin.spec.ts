import { test, expect } from "@playwright/test";
import { iniciarSesion } from "./ayuda";
import { cerrarSesionDemo } from "./sesion-demo.mjs";

// US-152: Toqui del administrador. La IA va en modo simulado (IA_SIMULADA=1): nunca llama a Claude.
test.afterEach(async ({ context }) => { await cerrarSesionDemo(context); });

const TOQUI = /Abrir el chat con Toqui/;

for (const rol of ["dueno", "admin"] as const) {
  test(`US-152: ${rol} ve a Toqui, toca un chip y recibe la respuesta simulada`, async ({ page }) => {
    await page.goto("/login");
    await iniciarSesion(page, rol);
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole("button", { name: TOQUI }).click();
    const chat = page.getByRole("dialog", { name: "Toqui" });
    await expect(chat).toBeVisible();
    await expect(chat.getByText("¡Hola! Soy Toqui. Pregúntame cómo va tu restaurante.")).toBeVisible();

    await chat.getByRole("button", { name: "¿Cómo me fue hoy?", exact: true }).click();
    await expect(chat.getByText(/Respuesta simulada de Toqui/)).toBeVisible({ timeout: 30_000 });

    // También está en las demás pantallas del admin.
    await page.keyboard.press("Escape");
    await page.goto("/admin/productos");
    await expect(page.getByRole("button", { name: TOQUI })).toBeVisible();
  });
}

test("US-152: el mesero no ve a Toqui", async ({ page }) => {
  await page.goto("/login");
  await iniciarSesion(page, "mesero");
  await expect(page).toHaveURL(/\/mesero$/);
  await expect(page.getByRole("heading", { name: "Panel mesero", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: TOQUI })).toHaveCount(0);
});
