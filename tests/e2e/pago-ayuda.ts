import { expect, type Page } from "@playwright/test";
import { pedidosPropios, RESTAURANTE, type EntornoPedido } from "./ayuda";

export const textoSoles = (centimos: number) => (centimos / 100).toFixed(2);

export async function saldoVisible(page: Page) {
  const etiqueta = page.getByText("Saldo pendiente", { exact: true });
  await expect(etiqueta).toBeVisible();
  const texto = await etiqueta.evaluate((el) => el.nextElementSibling?.textContent ?? "");
  const importe = texto.match(/[\d,]+\.\d{2}/)?.[0];
  if (!importe) throw new Error("No se pudo interpretar el saldo visible de la cuenta.");
  return Math.round(Number(importe.replaceAll(",", "")) * 100);
}

export async function cuentaPropia(pedido: EntornoPedido) {
  const propios = await pedidosPropios(pedido.admin, pedido.marca);
  expect(propios).toHaveLength(1);
  const p = propios[0];
  return { ...p, ruta: p.table_session_id ? `/caja/mesa/${p.table_session_id}` : `/caja/pedido/${p.id}` };
}

export async function entregarPropio(pedido: EntornoPedido) {
  let p = await cuentaPropia(pedido);
  if (p.status === "DELIVERED" || p.status === "CANCELLED") return;
  const cocina = await pedido.staff("cocina");
  await cocina.goto("/cocina");
  const transiciones = [
    { estado: "IN_PROGRESS", boton: `Marcar listo el pedido N.º ${p.order_number}` },
  ];
  for (const paso of transiciones) {
    p = await cuentaPropia(pedido);
    if (p.status !== paso.estado) continue;
    await cocina.getByRole("button", { name: paso.boton, exact: true }).click();
    await expect.poll(async () => (await cuentaPropia(pedido)).status).not.toBe(paso.estado);
  }
  const mesero = await pedido.staff("mesero");
  await mesero.goto(`/mesero/pedidos/${p.id}`);
  await mesero.getByRole("button", { name: "Confirmar entrega", exact: true }).click();
  await expect.poll(async () => (await cuentaPropia(pedido)).status).toBe("DELIVERED");
}

export async function pagarEfectivo(page: Page, monto: number, recibido = monto) {
  await page.getByText("Efectivo", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Efectivo", exact: true })).toBeChecked();
  await page.getByLabel(/^Monto a cobrar \(S\/\)/).fill(textoSoles(monto));
  await page.getByLabel("Efectivo recibido (S/)", { exact: true }).fill(textoSoles(recibido));
  const anterior = await saldoVisible(page);
  await page.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await expect.poll(() => saldoVisible(page)).toBe(Math.max(0, anterior - monto));
}

export async function cerrarOrdinaria(page: Page) {
  await page.getByRole("button", { name: "Cerrar cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Sí, cerrar cuenta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cuenta cerrada", exact: true })).toBeVisible();
}

// Solo registros propios; callback de fixture que corre también ante fallos.
export function prepararRecuperacion(pedido: EntornoPedido) {
  pedido.alLimpiar(async () => {
    const propios = await pedidosPropios(pedido.admin, pedido.marca);
    if (!propios.length) return;
    expect(propios).toHaveLength(1);
    const p = await cuentaPropia(pedido);
    const filtro = p.table_session_id ? "table_session_id" : "order_id";
    const idCuenta = p.table_session_id || p.id;
    const { data: pagos, error } = await pedido.admin.from("payments").select("id,status")
      .eq("restaurant_id", RESTAURANTE).eq(filtro, idCuenta);
    if (error) throw new Error("No se pudieron verificar los pagos propios para limpiar.");
    // Sin pagos y todavía cancelable: la fixture original cancela y libera la mesa.
    if (!pagos.length && ["PENDING", "ACCEPTED", "IN_PROGRESS", "CANCELLED"].includes(p.status)) return;
    await entregarPropio(pedido);
    const caja = await pedido.staff("caja");
    await caja.goto(p.ruta);
    if (await caja.getByRole("heading", { name: "Cuenta cerrada", exact: true }).count()) return;
    // Rechazar pendientes propios antes de cerrar, nunca dejarlos bloqueando la mesa.
    for (let i = 0; i < pagos.filter((pago) => pago.status === "PENDING").length; i++) {
      await caja.getByRole("button", { name: "Rechazar", exact: true }).first().click();
      await expect(caja.getByRole("button", { name: "Rechazar", exact: true })).toHaveCount(pagos.filter((pago) => pago.status === "PENDING").length - i - 1);
    }
    const saldo = await saldoVisible(caja);
    if (saldo > 0) {
      // Recuperación administrativa autorizada del saldo de esta prueba; no inventar
      // un cobro confirmado para esconder un fallo de pagos.
      const admin = await pedido.staff("admin");
      await admin.goto(p.ruta);
      await admin.getByLabel("Motivo de la excepción").fill(`PRUEBA E2E US-030: recuperación de caso interrumpido ${pedido.marca}`);
      await admin.getByRole("button", { name: "Cerrar con excepción", exact: true }).click();
      await expect(admin.getByRole("heading", { name: "Cuenta cerrada", exact: true })).toBeVisible();
    } else await cerrarOrdinaria(caja);
  });
}
