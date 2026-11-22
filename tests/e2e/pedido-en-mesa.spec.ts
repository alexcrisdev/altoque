import { expect } from "@playwright/test";
import { test, prepararCarrito, confirmarYVerificar, pedidosPropios, MESA_NUMERO, TOKEN_MESA } from "./ayuda";
import { aceptarDialogoDeAccion } from "./dialogos";
import { pagarMesaEnCaja, prepararRecuperacion } from "./pago-ayuda";

test("US-091: alergia declarada aparece en cocina y mesero tras el pago previo", async ({ page, pedido }) => {
  prepararRecuperacion(pedido);
  await pedido.abrirMesa();
  const carrito = await prepararCarrito(page, TOKEN_MESA, pedido);
  await carrito.getByRole("button", { name: "Sí", exact: true }).click();
  const confirmar = carrito.getByRole("button", { name: "Confirmar pedido", exact: true });
  await expect(confirmar).toBeDisabled();
  await carrito.getByLabel("Maní", { exact: true }).check();
  await carrito.getByLabel("Detalle (opcional, máx. 120)", { exact: true }).fill("Evitar contacto");
  await expect(confirmar).toBeDisabled();
  await carrito.getByLabel("Entiendo que la cocina hará lo posible por evitar el alérgeno, pero puede haber trazas.", { exact: true }).check();
  await confirmarYVerificar(page, pedido);
  await pagarMesaEnCaja(pedido);
  const [propio] = await pedidosPropios(pedido.admin, pedido.marca);
  const cocina = await pedido.staff("cocina");
  const tarjeta = cocina.getByRole("button", { name: `Marcar listo el pedido N.º ${propio.order_number}`, exact: true });
  await expect(tarjeta.getByText("Alergia: Maní — Evitar contacto")).toBeVisible();
  await expect(tarjeta).toHaveAccessibleDescription(/Alergia: Maní — Evitar contacto/);
  await expect(cocina.getByRole("button", { name: /Aceptar pedido|Empezar preparación/ })).toHaveCount(0);
  await tarjeta.click();
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca))[0].status).toBe("READY");
  await cocina.getByRole("button", { name: `Deshacer el pedido N.º ${propio.order_number}`, exact: true }).click();
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca))[0].status).toBe("IN_PROGRESS");
  const mesero = await pedido.staff("mesero");
  await mesero.goto("/mesero");
  await expect(mesero.getByText("Alergia: Maní — Evitar contacto")).toBeVisible();
});

test(`Mesa ${MESA_NUMERO} → pedido QR espera pago → mesero lo cancela sin cobrar`, async ({ page, pedido }) => {
  await pedido.abrirMesa();
  await prepararCarrito(page, TOKEN_MESA, pedido);
  // Pago previo obligatorio: queda esperando pago y cocina todavía no lo ve.
  await confirmarYVerificar(page, pedido);
  const [propio] = await pedidosPropios(pedido.admin, pedido.marca);
  expect(propio.status).toBe("PENDING");
  const mesero = await pedido.staff("mesero");
  await mesero.goto(`/mesero/pedidos/${propio.id}`);

  const botonCancelar = mesero.getByRole("button", {
    name: "Cancelar pedido",
    exact: true,
  });

  // Comprobar primero que el botón esté visible.
  await expect(botonCancelar).toBeVisible({ timeout: 10000 });

  // Confirmar la cancelación con su motivo y retirar el listener si falla el clic.
  await aceptarDialogoDeAccion(
    mesero,
    () => botonCancelar.click(),
    "prompt",
    "Escribe el motivo de cancelación:",
    "US-069: cancelación E2E por mesero",
  );
  // Verificar que el pedido quedó cancelado.
  await expect.poll(
    async () => {
      const [actual] = await pedidosPropios(pedido.admin, pedido.marca);
      return actual?.status;
    }
  ).toBe("CANCELLED");
});
