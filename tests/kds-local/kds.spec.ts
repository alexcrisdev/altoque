import { test, expect } from "@playwright/test";
import type {} from "./acciones";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.addInitScript(() => {
    class AudioSimulado {
      state = "running"; currentTime = 0; destination = {};
      async resume() {} async close() {}
      createOscillator() { return { frequency: { value: 0 }, connect() {}, disconnect() {}, start() { window.kds.tonos++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    }
    Object.defineProperty(window, "AudioContext", { value: AudioSimulado });
  });
});

for (let numero = 1; numero <= 9; numero++) {
  test(`tecla ${numero} marca la tarjeta numerada y 0 deshace`, async ({ page }) => {
    await page.goto("/tests/kds-local/index.html");
    await expect(page.getByRole("button", { name: `Marcar listo el pedido N.º ${numero}`, exact: true })).toBeVisible();
    await page.keyboard.press(String(numero));
    await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText(`Pedido N.º ${numero}`);
    await page.keyboard.press("0");
    await expect(page.getByRole("button", { name: `Marcar listo el pedido N.º ${numero}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.kds.llamadas.map((c) => c.deshacer))).toEqual([false, true]);
    await page.keyboard.press(`Numpad${numero}`);
    await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText(`Pedido N.º ${numero}`);
    await page.keyboard.press("Numpad0");
    await expect(page.getByRole("button", { name: `Marcar listo el pedido N.º ${numero}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.kds.llamadas.map((c) => c.deshacer))).toEqual([false, true, false, true]);
  });
}

test("resumen, FIFO, observaciones y alérgenos; clic de tarjeta sin confirmación", async ({ page }) => {
  let dialogos = 0;
  page.on("dialog", async (dialogo) => { dialogos++; await dialogo.dismiss(); });
  await page.goto("/tests/kds-local/index.html");
  await expect(page.getByRole("region", { name: "Resumen pendiente" })).toContainText("20× Ceviche clásico");
  const primero = page.getByRole("button", { name: /Marcar listo/ }).first();
  await expect(primero).toContainText("Pedido N.º 1");
  await expect(primero).toContainText("Observación: Sin ají");
  await expect(primero).toContainText("Alérgenos: Pescado");
  await expect(primero.locator("time")).toHaveAttribute("datetime", /T/);
  await expect(primero).toContainText("Llegó a las");
  await primero.click();
  await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText("Pedido N.º 1");
  expect(dialogos).toBe(0);
  await expect(page.getByRole("status").filter({ hasText: "marcado como Listo" })).toContainText("Pedido N.º 1");
});

test("las teclas no cambian de pedido hasta reasignarlas expresamente", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  const segundo = page.getByRole("button", { name: "Marcar listo el pedido N.º 2", exact: true });
  await expect(segundo).toContainText("Tecla 2");
  await page.keyboard.press("1");
  await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText("Pedido N.º 1");
  await expect(segundo).toContainText("Tecla 2");
  await page.keyboard.press("1");
  expect(await page.evaluate(() => window.kds.llamadas.length)).toBe(1);
  await page.getByRole("button", { name: "Reasignar teclas 1–9" }).click();
  await expect(segundo).toContainText("Tecla 1");
  await page.keyboard.press("1"); // El foco sigue en el botón: no activar otro pedido.
  expect(await page.evaluate(() => window.kds.llamadas.length)).toBe(1);
  await page.getByRole("heading", { name: "Falta preparar" }).click();
  await page.keyboard.press("1");
  await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText("Pedido N.º 2");
});

test("doble clic y repetición de tecla no duplican la escritura", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  await page.getByRole("button", { name: "Marcar listo el pedido N.º 1", exact: true }).dblclick();
  await expect(page.getByRole("region", { name: "Listos", exact: true })).toContainText("Pedido N.º 1");
  await page.getByRole("heading", { name: "Falta preparar" }).click();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2", repeat: true })));
  expect(await page.evaluate(() => window.kds.llamadas.length)).toBe(1);
});

test("teclado numérico, edición y vencimiento de Deshacer", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  await page.getByLabel("Observación de prueba").first().fill("1234567890");
  expect(await page.evaluate(() => window.kds.llamadas)).toHaveLength(0);
  await page.getByRole("heading", { name: "Falta preparar" }).click();
  await page.keyboard.press("Numpad1");
  await expect(page.getByRole("button", { name: /Deshacer pedido/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deshacer pedido/ })).toHaveCount(0, { timeout: 7000 });
  await page.keyboard.press("Numpad0");
  expect(await page.evaluate(() => window.kds.llamadas)).toHaveLength(1);
});

test("pedidos nuevos suenan una vez, cancelados parpadean y entregados desaparecen", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  await page.getByRole("button", { name: "Activar sonido" }).click();
  await page.evaluate(() => {
    const nuevo = structuredClone(window.kds.pedidos[0]);
    nuevo.id = "nuevo"; nuevo.numero = 11; nuevo.creadoEn = new Date().toISOString();
    window.kds.pedidos.push(nuevo);
    window.kds.pedidos.find((p) => p.numero === 1)!.estado = "CANCELLED";
    window.kds.pedidos.find((p) => p.numero === 2)!.estado = "DELIVERED";
  });
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 11", exact: true })).toBeVisible({ timeout: 7000 });
  const cancelado = page.getByRole("alert").filter({ hasText: "Pedido N.º 1 cancelado" });
  await expect(cancelado).toHaveClass(/animate-pulse/);
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 2", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.kds.tonos)).toBe(1);
  await expect(cancelado).toHaveCount(0, { timeout: 7000 });
  expect(await page.evaluate(() => window.kds.tonos)).toBe(1);
});

test("modo TV no muestra botones ni acepta atajos", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html?modo=tv");
  await expect(page.getByText("Modo TV", { exact: false })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await page.keyboard.press("1");
  await page.keyboard.press("0");
  expect(await page.evaluate(() => window.kds.llamadas)).toHaveLength(0);
});

test("columnas simultáneas en laptop y apiladas en móvil, sin desbordamiento", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  const preparacion = page.getByRole("region", { name: "En preparación", exact: true });
  const listos = page.getByRole("region", { name: "Listos", exact: true });
  await expect(preparacion).toBeVisible();
  const escritorioA = (await preparacion.boundingBox())!;
  const escritorioB = (await listos.boundingBox())!;
  expect(escritorioB.x).toBeGreaterThan(escritorioA.x);
  expect(Math.abs(escritorioB.y - escritorioA.y)).toBeLessThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await listos.boundingBox())!.x).toBe((await preparacion.boundingBox())!.x);
  expect((await listos.boundingBox())!.y).toBeGreaterThan((await preparacion.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mantiene pedidos ante un error de consulta y se recupera", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  await page.getByRole("button", { name: "Marcar listo el pedido N.º 1", exact: true }).waitFor();
  await page.evaluate(() => { window.kds.fallar = true; });
  await expect(page.getByRole("alert")).toContainText("Conservamos", { timeout: 7000 });
  await expect(page.getByRole("button", { name: /Marcar listo/ })).toHaveCount(10);
  await page.evaluate(() => { window.kds.fallar = false; });
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 7000 });
});

test("excluye ayer, aplica los tres colores y funciona sin audio", async ({ page }) => {
  await page.goto("/tests/kds-local/index.html");
  await page.getByRole("button", { name: "Activar sonido" }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(window, "AudioContext", { value: undefined });
    const fecha = Date.now();
    window.kds.pedidos.find((p) => p.numero === 1)!.creadoEn = new Date(fecha - 86400000).toISOString();
    window.kds.pedidos.find((p) => p.numero === 2)!.creadoEn = new Date(fecha - 21 * 60000).toISOString();
    window.kds.pedidos.find((p) => p.numero === 3)!.creadoEn = new Date(fecha - 11 * 60000).toISOString();
    window.kds.pedidos.find((p) => p.numero === 4)!.creadoEn = new Date(fecha).toISOString();
  });
  await page.getByRole("button", { name: "Activar sonido" }).click();
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 1", exact: true })).toHaveCount(0, { timeout: 7000 });
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 2", exact: true })).toHaveClass(/bg-peligro-fondo/);
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 3", exact: true })).toHaveClass(/bg-aviso-fondo/);
  await expect(page.getByRole("button", { name: "Marcar listo el pedido N.º 4", exact: true })).toHaveClass(/bg-exito-fondo/);
});
