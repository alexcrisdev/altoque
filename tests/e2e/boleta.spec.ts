import { createHmac } from "node:crypto";
import { expect } from "@playwright/test";
import { test, TOKEN_MOSTRADOR, prepararCarrito, confirmarYVerificar } from "./ayuda";
import { cuentaPropia, pagarEfectivo, saldoVisible, entregarPropio, cerrarOrdinaria, prepararRecuperacion } from "./pago-ayuda";

// Solo Supabase LOCAL y proveedor simulado: nunca emitir desde una prueba E2E
// contra Nubefact ni escribir en la base compartida para preparar esta prueba.
test("US-088: correo opcional, reserva y callback firmado visibles en caja (local)", async ({ page, pedido, request }, testInfo) => {
  const baseDatos = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://no-local.invalid");
  test.skip(!["localhost", "127.0.0.1"].includes(baseDatos.hostname), "Requiere Supabase local, serie de prueba y callback simulado");
  const secreto = process.env.N8N_WEBHOOK_SECRET;
  test.skip(!secreto, "Requiere secreto HMAC efímero del servidor local");
  prepararRecuperacion(pedido);
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido);
  const p = await cuentaPropia(pedido);
  if (process.env.US088_STRIPE_SIMULADO === "1") {
    const propio = await pedido.admin.from("orders").select("idempotency_key")
      .eq("restaurant_id", "10000000-0000-0000-0000-000000000001").eq("id", p.id).single();
    expect(propio.error).toBeNull();
    await page.goto(`/m/${TOKEN_MOSTRADOR}/pedido/${propio.data!.idempotency_key}`);
    await page.getByLabel("Correo para tu boleta (opcional)").fill("correo-invalido");
    await page.getByRole("button", { name: "Pagar con tarjeta", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Escribe un correo válido" })).toBeVisible();
    await expect(page).not.toHaveURL(/checkout\.stripe\.com/);
  }
  const caja = await pedido.staff("caja");
  await caja.goto(`/caja/pedido/${p.id}`);
  await caja.getByLabel("Correo para tu boleta (opcional)").fill("cliente@example.test");
  await expect(caja.getByText("Solo lo usamos para enviarte la boleta.")).toBeVisible();
  await pagarEfectivo(caja, await saldoVisible(caja));
  const recibo = await pedido.admin.from("receipts").select("payment_id, series, number, status")
    .eq("restaurant_id", "10000000-0000-0000-0000-000000000001").eq("order_id", p.id).single();
  expect(recibo.error).toBeNull();
  expect(recibo.data?.status).toBe("PENDIENTE");
  const dato = { pago_id: recibo.data!.payment_id, serie: recibo.data!.series, numero: recibo.data!.number,
    estado: "EMITIDO", enlace_pdf: "https://example.test/boleta-simulada.pdf", enlace_xml: "https://example.test/boleta-simulada.xml" };
  const cuerpo = JSON.stringify(dato);
  expect((await request.post("/api/n8n/comprobantes", { data: dato })).status()).toBe(401);
  for (let i = 0; i < 2; i++) {
    const tiempo = String(Math.floor(Date.now() / 1000));
    const firma = createHmac("sha256", secreto!).update(`${tiempo}.${cuerpo}`).digest("hex");
    expect((await request.post("/api/n8n/comprobantes", { data: cuerpo, headers: { "Content-Type": "application/json", "X-AlToque-Timestamp": tiempo, "X-AlToque-Firma": `sha256=${firma}` } })).status()).toBe(200);
  }
  await caja.reload();
  await expect(caja.getByText(`Boleta ${dato.serie}-${dato.numero} (prueba)`, { exact: true })).toBeVisible();
  await expect(caja.getByRole("link", { name: "Ver PDF", exact: true })).toHaveAttribute("href", dato.enlace_pdf);
  await expect(caja.getByText("Comprobante de prueba, sin valor tributario", { exact: true })).toBeVisible();
  await caja.setViewportSize({ width: 390, height: 844 });
  expect(await caja.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await caja.screenshot({ path: testInfo.outputPath("us088-caja-simulada.png"), fullPage: true });
  expect((await pedido.admin.from("receipts").select("id").eq("order_id", p.id)).data).toHaveLength(1);
  await entregarPropio(pedido);
  await cerrarOrdinaria(caja);
});
