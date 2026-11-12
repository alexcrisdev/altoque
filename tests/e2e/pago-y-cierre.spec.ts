import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, MESA_NUMERO, TOKEN_MESA, TOKEN_MOSTRADOR, prepararCarrito, confirmarYVerificar, RESTAURANTE } from "./ayuda";
import { saldoVisible, cuentaPropia, entregarPropio, pagarEfectivo, cerrarOrdinaria, prepararRecuperacion, textoSoles } from "./pago-ayuda";

test.setTimeout(180_000);
test.use({ actionTimeout: 20_000 });

test("CP-030-07 a 11: entrega, Yape, tarjeta, efectivo parcial y cierre de Mesa 5", async ({ page, pedido }) => {
  expect(MESA_NUMERO, "US-030 solo usa Mesa 5").toBe(5);
  prepararRecuperacion(pedido);
  await pedido.abrirMesa();
  await prepararCarrito(page, TOKEN_MESA, pedido.marca);
  await confirmarYVerificar(page, pedido);
  await entregarPropio(pedido);
  const p = await cuentaPropia(pedido);
  const caja = await pedido.staff("caja");
  await expect(caja.getByRole("region", { name: "Mesas", exact: true })
    .getByRole("listitem").filter({ has: caja.getByRole("heading", { name: "Mesa 5", exact: true }) })
    .getByText("Ocupada", { exact: true })).toBeVisible();
  await caja.getByRole("region", { name: "Cuentas por cobrar o cerrar", exact: true })
    .getByRole("link", { name: /^Mesa 5\b/ }).click();
  await expect(caja).toHaveURL(new RegExp(`/caja/mesa/${p.table_session_id}$`));
  const total = await saldoVisible(caja);
  expect(total).toBeGreaterThanOrEqual(4);
  const parte = Math.max(1, Math.floor(total / 4));

  await test.step("CP-030-09: Yape pendiente y rechazado no descuentan; confirmado sí", async () => {
    await caja.getByText("Yape", { exact: true }).click();
    await caja.getByLabel(/^Monto \(S\/\)/).fill(textoSoles(parte));
    await caja.getByLabel("N.º de operación de Yape", { exact: true }).fill(`US030-R-${randomUUID().slice(0,8)}`);
    await caja.getByRole("button", { name: "Registrar Yape", exact: true }).click();
    await expect(caja.getByRole("button", { name: "Rechazar", exact: true })).toHaveCount(1);
    expect(await saldoVisible(caja)).toBe(total);
    await expect(caja.getByRole("button", { name: "Cerrar cuenta", exact: true })).toHaveCount(0);
    await expect(caja.getByRole("status").filter({ hasText: /Yape por verificar/ })).toBeVisible();
    await caja.getByRole("button", { name: "Rechazar", exact: true }).click();
    await expect(caja.getByRole("button", { name: "Rechazar", exact: true })).toHaveCount(0);
    expect(await saldoVisible(caja)).toBe(total);
    await caja.getByLabel("N.º de operación de Yape", { exact: true }).fill(`US030-C-${randomUUID().slice(0,8)}`);
    await caja.getByRole("button", { name: "Registrar Yape", exact: true }).click();
    await caja.getByRole("button", { name: "Confirmar recepción", exact: true }).click();
    await expect.poll(() => saldoVisible(caja)).toBe(total - parte);
  });

  await test.step("CP-030-10: tarjeta rechazada no descuenta; aprobada sí", async () => {
    const anterior = await saldoVisible(caja);
    await caja.getByText("Tarjeta", { exact: true }).click();
    await caja.getByLabel(/^Monto \(S\/\)/).fill(textoSoles(parte));
    await caja.getByLabel(/^Referencia del voucher/).fill(`US030-R-${randomUUID().slice(0,8)}`);
    await caja.getByText("Rechazado", { exact: true }).click();
    await caja.getByRole("button", { name: "Registrar pago con tarjeta", exact: true }).click();
    await expect(caja.getByRole("alert").filter({ hasText: "Pago rechazado por el POS" })).toBeVisible();
    expect(await saldoVisible(caja)).toBe(anterior);
    await caja.getByLabel(/^Referencia del voucher/).fill(`US030-A-${randomUUID().slice(0,8)}`);
    await caja.getByText("Aprobado", { exact: true }).click();
    await caja.getByRole("button", { name: "Registrar pago con tarjeta", exact: true }).click();
    await expect.poll(() => saldoVisible(caja)).toBe(anterior - parte);
  });

  await test.step("CP-030-08: efectivo parcial y resto con vuelto", async () => {
    const anterior = await saldoVisible(caja);
    const parcial = Math.max(1, Math.floor(anterior / 2));
    await pagarEfectivo(caja, parcial);
    const resto = await saldoVisible(caja);
    await pagarEfectivo(caja, resto, resto + 100);
    await expect(caja.getByText(/Recibido .*vuelto S\/\s*1\.00/)).toBeVisible();
  });

  await test.step("CP-030-11: cierre persistido y mesa libre", async () => {
    await cerrarOrdinaria(caja);
    const resumen = caja.getByRole("region", { name: "Cuenta cerrada", exact: true });
    await expect(resumen.getByText("Cerrada por", { exact: true })).toBeVisible();
    await expect(resumen.getByText("Fecha y hora", { exact: true })).toBeVisible();
    const cierre = await pedido.admin.from("account_closures").select("kind,balance,closed_by,closed_at")
      .eq("restaurant_id", RESTAURANTE).eq("table_session_id", p.table_session_id!).single();
    expect(cierre.error).toBeNull();
    expect(cierre.data?.kind).toBe("ORDINARY");
    expect(Number(cierre.data?.balance)).toBe(0);
    expect(cierre.data?.closed_by).toBeTruthy();
    const mesero = await pedido.staff("mesero");
    await mesero.goto("/mesero");
    const mesa = mesero.getByRole("listitem").filter({ has: mesero.getByRole("heading", { name: "Mesa 5", exact: true }) });
    await expect(mesa.getByText("Libre", { exact: true })).toBeVisible();
  });
});

test("CP-030-12: caja no autoriza excepción; admin cierra con motivo", async ({ page, pedido }) => {
  expect(MESA_NUMERO).toBe(5);
  prepararRecuperacion(pedido);
  await pedido.abrirMesa();
  await prepararCarrito(page, TOKEN_MESA, pedido.marca);
  await confirmarYVerificar(page, pedido);
  await entregarPropio(pedido);
  const p = await cuentaPropia(pedido);
  const caja = await pedido.staff("caja");
  await caja.goto(p.ruta);
  await expect(caja.getByRole("button", { name: "Cerrar con excepción", exact: true })).toHaveCount(0);
  const admin = await pedido.staff("admin");
  await admin.goto(p.ruta);
  const motivo = `PRUEBA E2E US-030: cortesía de aceptación ${pedido.marca}`;
  await admin.getByLabel("Motivo de la excepción").fill(motivo);
  await admin.getByRole("button", { name: "Cerrar con excepción", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Cuenta cerrada", exact: true })).toBeVisible();
  await expect(admin.getByText(`Motivo: ${motivo}`, { exact: true })).toBeVisible();
});

test("CP-030-13: para llevar pagado y cerrado rechaza nuevos pagos", async ({ page, pedido }) => {
  prepararRecuperacion(pedido);
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido);
  await entregarPropio(pedido);
  const p = await cuentaPropia(pedido);
  const caja = await pedido.staff("caja");
  await caja.getByRole("region", { name: "Cuentas por cobrar o cerrar", exact: true })
    .getByRole("link").filter({ hasText: `Para llevar #${p.order_number} – PRUEBA E2E` }).click();
  await expect(caja).toHaveURL(new RegExp(`/caja/pedido/${p.id}$`));
  await pagarEfectivo(caja, await saldoVisible(caja));
  await cerrarOrdinaria(caja);
  await caja.reload();
  await expect(caja.getByRole("heading", { name: "Registrar pago", exact: true })).toHaveCount(0);
  // Intento directo con usuario normal: el servidor también debe rechazarlo.
  const anteriores = await pedido.admin.from("payments").select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANTE).eq("order_id", p.id);
  expect(anteriores.error).toBeNull();
  const resultado = await pedido.admin.rpc("registrar_pago", {
    p_sesion_id: null, p_pedido_id: p.id, p_metodo: "CASH", p_monto: "0.01",
    p_recibido: "0.01", p_referencia: null, p_aprobado: null, p_clave: randomUUID(),
  });
  // El criterio exige rechazo sin insertar: la RPC puede detectar primero saldo
  // cero (NOTHING_TO_PAY) o cuenta cerrada, sin cambiar el resultado de negocio.
  expect(resultado.error).not.toBeNull();
  const despues = await pedido.admin.from("payments").select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANTE).eq("order_id", p.id);
  expect(despues.error).toBeNull();
  expect(despues.count).toBe(anteriores.count);
});
