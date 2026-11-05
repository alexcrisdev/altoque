import { test, expect } from "@playwright/test";
import { iniciarSesion, type RolDemo } from "./ayuda";

const roles: [RolDemo, string, string][] = [
  ["mesero", "/mesero", "Panel mesero"],
  ["cocina", "/cocina", "Cocina"],
  ["caja", "/caja", "Caja"],
  ["admin", "/admin", "Panel administrador"],
  ["dueno", "/admin", "Panel administrador"],
];
for (const [rol, ruta, titulo] of roles) {
  test(`${rol} accede a su pantalla`, async ({ page }) => {
    await page.goto("/login");
    await iniciarSesion(page, rol);
    await expect(page).toHaveURL(new RegExp(`${ruta}$`));
    await expect(page.getByRole("heading", { name: titulo, exact: true })).toBeVisible();
  });
}
for (const ruta of ["/caja", "/admin"]) {
  test(`cocina no accede a ${ruta}`, async ({ page }) => {
    await page.goto("/login");
    await iniciarSesion(page, "cocina");
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/sin-acceso$/);
  });
}
test("sin sesión no accede a mesero", async ({ page }) => {
  await page.goto("/mesero");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
});
