import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { iniciarSesion } from "./ayuda";
import { cerrarSesionDemo } from "./sesion-demo.mjs";

// US-156: «✨ Autocompletar» con IA_SIMULADA=1 (sin Claude ni Open Food Facts). Solo Supabase local.
const NOMBRE = `PRUEBA E2E US-156 ${randomUUID().slice(0, 8)}`;

test.afterEach(async ({ context }) => { await cerrarSesionDemo(context); });

// Borra el producto de prueba con la cuenta del dueño (RLS), aunque la prueba falle.
test.afterAll(async () => {
  const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email: "dueno@polleria.demo", password: process.env.DEMO_PASSWORD! });
  if (error) throw new Error("No se pudo iniciar sesión para limpiar el producto de prueba.");
  const borrado = await cliente.from("products").delete().eq("name", NOMBRE);
  await cliente.auth.signOut({ scope: "local" });
  if (borrado.error) throw new Error("No se pudo borrar el producto de prueba.");
});

test("US-156: el dueño autocompleta, revisa lo sugerido, pone precio y guarda", async ({ page }) => {
  await page.goto("/login");
  await iniciarSesion(page, "dueno");
  await page.goto("/admin/productos");
  await page.getByRole("link", { name: /Platos de fondo/ }).click();

  const formulario = page.locator("section", { has: page.getByRole("heading", { name: "Nuevo producto" }) });
  await formulario.getByLabel("Nombre").fill(NOMBRE);
  await formulario.getByRole("button", { name: /Autocompletar/ }).click();

  await expect(formulario.getByText("Revisa lo sugerido antes de guardar.")).toBeVisible({ timeout: 30_000 });
  await expect(formulario.getByLabel(/Descripción/)).toHaveValue(/modo simulado/);
  await expect(formulario.getByText(/Sugerido/).first()).toBeVisible();

  // El alérgeno sugerido NO se marca solo: el dueño lo confirma.
  const chip = formulario.getByRole("button", { name: "¿Contiene gluten?" });
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(formulario.getByLabel("Alérgenos (separados por comas)")).toHaveValue("");
  await chip.click();
  await expect(formulario.getByLabel("Alérgenos (separados por comas)")).toHaveValue("Gluten");

  // El precio nunca se llena solo.
  await expect(formulario.getByLabel("Precio (S/)")).toHaveValue("");
  await formulario.getByLabel("Precio (S/)").fill("25.50");
  await formulario.getByRole("button", { name: "Crear producto" }).click();
  await expect(formulario.getByText("Producto creado.")).toBeVisible({ timeout: 30_000 });
});
