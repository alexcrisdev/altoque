import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelCarrito } from "../../src/features/pedidos/panel-carrito";
import type { ResultadoRegistroPedido } from "../../src/features/pedidos/actions";

const producto = {
  id: "limonada", category_id: "bebidas", name: "Limonada",
  description: null, price: 8.5, image_url: null, available: true,
  ingredients: null, allergens: [],
};
const props = {
  items: [{ productoId: producto.id, cantidad: 2, observacion: "Sin hielo" }],
  productos: [producto], cantidadMaxima: 20, observacionesHabilitadas: true,
  observacionMaxima: 140, pedidosHabilitados: true, enviando: false,
  resultado: null as ResultadoRegistroPedido | null,
  onCambiarCantidad() {}, onEliminar() {}, onCambiarObservacion() {}, onConfirmar() {},
};

function render(cambios: Partial<typeof props> = {}) {
  return renderToStaticMarkup(createElement(PanelCarrito, { ...props, ...cambios }));
}

describe("revisión y confirmación del carrito", () => {
  it("muestra cantidades, observaciones, total y confirmación disponible", () => {
    const html = render();
    expect(html).toContain("Sin hielo");
    expect(html).toContain("2 unidades");
    expect(html).toContain("17.00");
    expect(html).toMatch(/<button[^>]*>Confirmar pedido<\/button>/);
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>Confirmar pedido<\/button>/);
  });

  it("impide confirmar una mesa sin sesión abierta", () => {
    const html = render({ pedidosHabilitados: false });
    expect(html).toContain("Pide al mesero que habilite la mesa");
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Confirmar pedido<\/button>/);
  });

  it("bloquea la edición y confirmación durante el envío", () => {
    const html = render({ enviando: true });
    expect(html).toMatch(/<fieldset[^>]* disabled=""/);
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Confirmando pedido\.\.\.<\/button>/);
  });

  it("muestra el número de pedido aunque el carrito ya esté vacío", () => {
    const html = render({ items: [], resultado: { ok: true, numero: 42 } });
    expect(html).toContain("Tu número de pedido es 42");
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Confirmar pedido<\/button>/);
  });

  it("conserva el resumen y muestra cada problema con su producto", () => {
    const problemas = [
      { productoId: "limonada", motivo: "PRECIO_CAMBIO", precioActualCentimos: 900 },
      { nombre: "Ceviche", motivo: "AGOTADO" },
      { nombre: "Chicha", motivo: "INACTIVO" },
      { productoId: "retirado", motivo: "NO_EXISTE" },
    ];
    const html = render({ resultado: { ok: false, mensaje: "Revisa los productos.", problemas } });
    expect(html).toContain("Revisa los productos.");
    expect(html).toContain("Limonada:");
    expect(html).toContain("9.00");
    expect(html).toContain("Ceviche:");
    expect(html).toContain("Está agotado");
    expect(html).toContain("Chicha:");
    expect(html).toContain("Ya no está activo");
    expect(html).toContain("Producto retirado:");
    expect(html).toContain("Ya no existe");
    expect(html).toContain("Sin hielo");
    expect(html).toContain("17.00");
  });
});
