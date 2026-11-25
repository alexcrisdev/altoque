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
// US-106: matriz de 5 cuentas × 4 paneles. Por URL, un panel ajeno lleva a /sin-acceso,
// también para dueño y admin; y el menú no muestra destinos de otros paneles.
const panelPropio: Record<RolDemo, string> = {
  mesero: "/mesero", cocina: "/cocina", caja: "/caja", admin: "/admin", dueno: "/admin",
};
for (const [rol, propio] of Object.entries(panelPropio) as [RolDemo, string][]) {
  test(`US-106: ${rol} solo entra a ${propio}`, async ({ page }) => {
    await page.goto("/login");
    await iniciarSesion(page, rol);
    await expect(page).toHaveURL(new RegExp(`${propio}$`));
    await expect(page.getByRole("navigation", { name: "Cambiar de panel" })).toHaveCount(0);
    for (const ajeno of ["/admin", "/mesero", "/cocina", "/caja"].filter((ruta) => ruta !== propio)) {
      await expect(page.locator(`a[href^="${ajeno}"]`)).toHaveCount(0);
      await page.goto(ajeno);
      await expect(page, `${rol} no debe abrir ${ajeno}`).toHaveURL(/\/sin-acceso$/);
      await page.goto(propio);
    }
  });
}
test("sin sesión no accede a mesero", async ({ page }) => {
  await page.goto("/mesero");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
});
