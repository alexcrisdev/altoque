import { expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { test, MESA_NUMERO, TOKEN_MESA, prepararCarrito, confirmarYVerificar, cerrarMesa, RESTAURANTE } from "./ayuda";
import { cuentaPropia, entregarPropio, prepararRecuperacion } from "./pago-ayuda";

test.setTimeout(180_000);
test.use({ actionTimeout: 20_000 });

// US-106: el flujo completo con una cuenta por paso. El cliente (sin sesión) ve «Tu cuenta»
// y paga con captura Yape; caja verifica; cocina prepara; el mesero entrega y libera la mesa
// solo cuando ve «Lista para liberar». El mesero nunca ve cobros.
test("US-106: QR, captura Yape, caja, cocina, entrega y liberación con su cuenta cada uno", async ({ page, pedido }) => {
  expect(MESA_NUMERO, "Solo usa la mesa reservada para E2E").toBe(5);
  prepararRecuperacion(pedido);

  // La captura Yape solo se ofrece si el restaurante tiene titular; se restaura al terminar.
  const anterior = await pedido.admin.from("restaurants").select("wallet_holder_name").eq("id", RESTAURANTE).single();
  expect(anterior.error).toBeNull();
  pedido.alLimpiar(async () => {
    const { error } = await pedido.admin.from("restaurants")
      .update({ wallet_holder_name: anterior.data!.wallet_holder_name }).eq("id", RESTAURANTE);
    expect(error).toBeNull();
  });
  expect((await pedido.admin.from("restaurants").update({ wallet_holder_name: "Titular E2E" }).eq("id", RESTAURANTE)).error).toBeNull();

  // Si la prueba falla con la captura sin verificar, caja la rechaza: un Yape pendiente
  // impide cerrar la mesa. Se registra al final para que corra antes que las demás limpiezas.
  pedido.alLimpiar(async () => {
    const propio = await cuentaPropia(pedido).catch(() => null);
    if (!propio?.table_session_id) return;
    const pendientes = async () => {
      const { data, error } = await pedido.admin.from("payment_proofs").select("id")
        .eq("restaurant_id", RESTAURANTE).eq("table_session_id", propio.table_session_id!).eq("status", "PENDING");
      if (error) throw new Error("No se pudieron revisar las capturas propias.");
      return data.length;
    };
    if (await pendientes() === 0) return;
    const caja = await pedido.staff("caja");
    await caja.goto("/caja");
    const capturas = caja.getByRole("region", { name: "Capturas por verificar", exact: true });
    await capturas.getByRole("button", { name: "No llegó", exact: true }).first().click();
    await capturas.getByLabel("Motivo del rechazo (obligatorio)").fill("Limpieza de prueba E2E");
    await capturas.getByRole("button", { name: "Registrar rechazo", exact: true }).click();
    await expect.poll(pendientes, { timeout: 30_000 }).toBe(0);
  });

  await pedido.abrirMesa(); // mesero
  await prepararCarrito(page, TOKEN_MESA, pedido); // cliente QR
  await confirmarYVerificar(page, pedido);
  const p = await cuentaPropia(pedido);
  expect(p.status).toBe("PENDING");

  await test.step("cliente: «Tu cuenta», saldo y aviso de efectivo en caja", async () => {
    await page.reload();
    const cuenta = page.locator(".cuenta-cliente");
    await expect(cuenta.getByRole("heading", { name: "Tu cuenta", exact: true })).toBeVisible();
    await expect(cuenta.getByText(/^S\/\s*\d+\.\d{2}$/)).toBeVisible();
    await expect(cuenta.getByRole("button", { name: "Pagar en caja", exact: true })).toBeVisible();
  });

  const mesero = await pedido.staff("mesero");
  const mesaMesero = mesero.getByRole("listitem").filter({ has: mesero.getByRole("heading", { name: `Mesa ${MESA_NUMERO}`, exact: true }) });

  await test.step("mesero: sabe que falta pagar, sin montos ni cobros", async () => {
    await mesero.goto("/mesero");
    await expect(mesaMesero.getByText("Falta pagar en caja", { exact: true })).toBeVisible();
    await expect(mesero.getByRole("region", { name: /Yape|Capturas/ })).toHaveCount(0);
  });

  await test.step("cliente: sube la captura del Yape", async () => {
    // Imagen distinta en cada corrida: la app rechaza aprobar dos veces la misma captura (US-102).
    const imagen = await sharp(randomBytes(64 * 64 * 3), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
    await page.getByRole("button", { name: "Pagar con Yape o Plin", exact: true }).click();
    await page.getByLabel("Ya pagué → Subir captura").setInputFiles({ name: "captura.png", mimeType: "image/png", buffer: imagen });
    await page.getByRole("button", { name: "Enviar captura", exact: true }).click();
    await expect(page.getByText(/^Captura enviada\./)).toBeVisible();
  });

  await test.step("caja: verifica la captura y el pedido entra a cocina", async () => {
    const caja = await pedido.staff("caja");
    await caja.goto("/caja");
    const capturas = caja.getByRole("region", { name: "Capturas por verificar", exact: true });
    await expect(capturas.getByRole("heading", { name: `Mesa ${MESA_NUMERO} · Yape`, exact: true })).toBeVisible();
    const llego = capturas.getByRole("button", { name: "Llegó completo", exact: true });
    await expect(llego).toHaveCount(1);
    await llego.click();
    // Caja tiene 10 s para deshacer; luego se registra y el pago previo libera la cocina.
    await expect.poll(async () => (await cuentaPropia(pedido)).status, { timeout: 30_000 }).toBe("IN_PROGRESS");
  });

  await test.step("cocina marca listo y el mesero entrega", async () => {
    await entregarPropio(pedido); // cocina → listo; mesero → entregado
  });

  await test.step("mesero: «Lista para liberar» y libera la mesa", async () => {
    await mesero.goto("/mesero");
    await expect(mesaMesero.getByText("Lista para liberar", { exact: true })).toBeVisible();
    await cerrarMesa(mesero, p.table_session_id!);
    await expect(mesaMesero.getByText("Libre", { exact: true })).toBeVisible();
    const cierre = await pedido.admin.from("account_closures").select("kind,balance")
      .eq("restaurant_id", RESTAURANTE).eq("table_session_id", p.table_session_id!).single();
    expect(cierre.error).toBeNull();
    expect(cierre.data).toMatchObject({ kind: "ORDINARY" });
    expect(Number(cierre.data!.balance)).toBe(0);
  });
});
