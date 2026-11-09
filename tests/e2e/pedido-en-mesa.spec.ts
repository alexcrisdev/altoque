import { expect } from "@playwright/test";
import { test, prepararCarrito, confirmarYVerificar, pedidosPropios, MESA_NUMERO, TOKEN_MESA } from "./ayuda";

test(`Mesa ${MESA_NUMERO} → abrir sesión → pedido en cocina y mesero → limpiar`, async ({ page, pedido }) => {
  await pedido.abrirMesa();
  await prepararCarrito(page, TOKEN_MESA, pedido.marca);
  await confirmarYVerificar(page, pedido);
  const [propio] = await pedidosPropios(pedido.admin, pedido.marca);
  pedido.alLimpiar(async () => {
    const [actual] = await pedidosPropios(pedido.admin, pedido.marca);
    if (actual?.status === "READY") {
      const resultado = await pedido.admin.rpc("cambiar_estado_pedido", { p_pedido_id: actual.id, p_estado: "IN_PROGRESS", p_motivo: null });
      expect(resultado.error, "Recuperar el pedido propio antes de la limpieza si falló Deshacer").toBeNull();
    }
  });
  const cocina = await pedido.staff("cocina");
  await expect(cocina.getByRole("button", { name: /Aceptar pedido|Empezar preparación/ })).toHaveCount(0);
  await cocina.getByRole("button", { name: `Marcar listo el pedido N.º ${propio.order_number}`, exact: true }).click();
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca))[0].status).toBe("READY");
  await cocina.getByRole("button", { name: `Deshacer el pedido N.º ${propio.order_number}`, exact: true }).click();
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca))[0].status).toBe("IN_PROGRESS");
  const mesero = await pedido.staff("mesero");
  await mesero.goto(`/mesero/pedidos/${propio.id}`);
  mesero.once("dialog", (dialogo) => dialogo.accept("US-069: cancelación E2E por mesero"));
  await mesero.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca))[0].status).toBe("CANCELLED");
});
