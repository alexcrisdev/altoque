import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  test, MESA_NUMERO, TOKEN_MOSTRADOR, RESTAURANTE,
  prepararCarrito, confirmarYVerificar, cerrarMesa,
} from "./ayuda";
import { cuentaPropia, pagarParaLlevarEnCaja, prepararRecuperacion } from "./pago-ayuda";

test.setTimeout(90_000);

test("US-082: caja distingue mesa libre y ocupada e impide ofrecer una segunda apertura", async ({ pedido }) => {
  expect(MESA_NUMERO, "US-082 utiliza exclusivamente la mesa demo reservada").toBe(5);
  const caja = await pedido.staff("caja");
  const mesas = caja.getByRole("region", { name: "Mesas", exact: true });
  const mesa = mesas.getByRole("listitem").filter({ has: caja.getByRole("heading", { name: `Mesa ${MESA_NUMERO}`, exact: true }) });
  await expect(mesa.getByText("Libre", { exact: true })).toBeVisible();
  await pedido.abrirMesa();
  await expect(mesa.getByText("Ocupada", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(mesa.getByText("No se puede abrir otra sesión: esta mesa ya tiene una cuenta abierta.", { exact: true })).toBeVisible();
  await expect(mesa.getByRole("button", { name: /Abrir/ })).toHaveCount(0);
  const enlace = mesa.getByRole("link", { name: `Ver cuenta de Mesa ${MESA_NUMERO}`, exact: true });
  const href = await enlace.getAttribute("href");
  expect(href).toMatch(/^\/caja\/mesa\/[\da-f-]+$/);
  const cuentas = caja.getByRole("region", { name: "Cuentas por cobrar o cerrar", exact: true });
  await expect(cuentas.getByRole("link", { name: new RegExp(`^Mesa ${MESA_NUMERO}\\b`) })).toHaveAttribute("href", href!);

  // Verifica el límite existente exclusivamente sobre nuestra sesión de prueba.
  const { data, error } = await pedido.admin.from("table_sessions")
    .select("id, branch_id, dining_table_id, dining_tables!inner(number)").eq("restaurant_id", RESTAURANTE)
    .eq("dining_tables.number", MESA_NUMERO).is("closed_at", null);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(href).toBe(`/caja/mesa/${data![0].id}`);
  const { data: usuario, error: errorUsuario } = await pedido.admin.auth.getUser();
  expect(errorUsuario).toBeNull();
  expect(usuario.user).toBeTruthy();
  const intentoId = randomUUID();
  const intento = await pedido.admin.from("table_sessions").insert({
    id: intentoId, restaurant_id: RESTAURANTE, branch_id: data![0].branch_id,
    dining_table_id: data![0].dining_table_id, opened_by: usuario.user!.id,
  });
  try {
    expect(intento.error?.code, "La base debe rechazar una segunda sesión abierta").toBe("23505");
  } finally {
    // Si faltase la protección en el entorno, no dejar una segunda sesión propia.
    if (!intento.error) {
      const limpieza = await pedido.admin.from("table_sessions")
        .update({ closed_at: new Date().toISOString(), closed_by: usuario.user!.id })
        .eq("restaurant_id", RESTAURANTE).eq("id", intentoId);
      expect(limpieza.error).toBeNull();
    }
  }
  await enlace.click();
  await expect(caja).toHaveURL(new RegExp(`/caja/mesa/${data![0].id}$`));
  await caja.goto("/caja");
  await cerrarMesa(await pedido.staff("mesero"), data![0].id);
  await expect(mesa.getByText("Libre", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(mesa.getByRole("link")).toHaveCount(0);
});

test("US-082 / US-085: caja identifica y cobra el pedido para llevar antes de cocina", async ({ page, pedido }) => {
  prepararRecuperacion(pedido);
  await prepararCarrito(page, TOKEN_MOSTRADOR, pedido.marca);
  await confirmarYVerificar(page, pedido);
  const p = await cuentaPropia(pedido);
  const caja = await pedido.staff("caja");
  const cuentas = caja.getByRole("region", { name: "Cuentas por cobrar o cerrar", exact: true });
  const cuenta = cuentas.getByRole("link").filter({ hasText: `Para llevar #${p.order_number} – PRUEBA E2E` });
  await expect(cuenta).toHaveAttribute("href", `/caja/pedido/${p.id}`);
  await cuenta.click();
  await expect(caja).toHaveURL(new RegExp(`/caja/pedido/${p.id}$`));
  await pagarParaLlevarEnCaja(pedido);
});
