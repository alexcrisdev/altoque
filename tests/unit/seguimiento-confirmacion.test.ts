import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelCarrito } from "../../src/features/pedidos/panel-carrito";
import type { ResultadoRegistroPedido } from "../../src/features/pedidos/actions";

const props = {
  items: [], productos: [], cantidadMaxima: 20,
  observacionesHabilitadas: true, observacionMaxima: 140,
  pedidosHabilitados: true, enviando: false,
  resultado: { ok: true, numero: 127 } as ResultadoRegistroPedido,
  seguimientoHref: "/m/token-de-prueba/pedido/clave-de-prueba",
  alergia: { respuesta: null, alergenos: [], detalle: "", aceptada: false } as import("../../src/features/pedidos/alergias").AlergiaFormulario,
  onAlergia() {}, onCambiarCantidad() {}, onEliminar() {},
  onCambiarObservacion() {}, onConfirmar() {},
};

describe("US-127: seguimiento después de confirmar", () => {
  it("ofrece el enlace del pedido confirmado y retira el formulario de alergias", () => {
    const html = renderToStaticMarkup(createElement(PanelCarrito, props));
    expect(html).toContain("Tu número de pedido es 127");
    expect(html).toContain(`href="${props.seguimientoHref}"`);
    expect(html).toContain("Ver el estado de mi pedido");
    expect(html).not.toContain("¿Alguien tiene alergias?");
    expect(html).not.toContain("Confirmar pedido");
    expect(html).toContain("Cerrar");
  });

  it("explica dónde consultar el pago sin afirmar que el pedido está pagado", () => {
    const html = renderToStaticMarkup(createElement(PanelCarrito, props));
    expect(html).toContain("Si falta pagar");
    expect(html).toContain("estado del pago");
    expect(html).not.toContain("verás el saldo");
    expect(html).toContain("pagar en caja");
  });

  it.each([null, { ok: false, mensaje: "Revisa los productos." }])(
    "no ofrece el seguimiento anterior cuando no hay confirmación exitosa: %j",
    (resultado) => {
      const html = renderToStaticMarkup(createElement(PanelCarrito, {
        ...props, resultado: resultado as ResultadoRegistroPedido | null,
      }));
      expect(html).not.toContain(`href="${props.seguimientoHref}"`);
      expect(html).toContain("¿Alguien tiene alergias?");
      expect(html).toContain("Confirmar pedido");
    },
  );
});
