import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Boton } from "../../src/components/ui/boton";
import { PanelCarrito } from "../../src/features/pedidos/panel-carrito";

describe("US-126: confirmación visible del carrito", () => {
  it("el pie contiene total y confirmar, separado de los datos desplazables", () => {
    const html = renderToStaticMarkup(createElement(PanelCarrito, {
      items: [], productos: [], cantidadMaxima: 20,
      observacionesHabilitadas: true, observacionMaxima: 140,
      pedidosHabilitados: true, enviando: false, resultado: null,
      alergia: { respuesta: "YES", alergenos: [], detalle: "", aceptada: false },
      onAlergia() {}, onCambiarCantidad() {}, onEliminar() {},
      onCambiarObservacion() {}, onConfirmar() {},
      opciones: createElement("label", null, "Modalidad de consumo"),
    }));
    const inicioPie = html.indexOf("<footer");
    const contenido = html.slice(html.indexOf("data-carrito-contenido"), inicioPie);
    const pie = html.slice(inicioPie, html.indexOf("</footer>", inicioPie));
    expect(inicioPie).toBeGreaterThan(0);
    expect(contenido).toContain("Modalidad de consumo");
    expect(contenido).toContain("Detalle (opcional");
    expect(contenido).toContain("Seguir viendo la carta");
    expect(pie).toContain("Total");
    expect(pie).toContain("Confirmar pedido");
    expect(pie.match(/<button\b/g)).toHaveLength(1);
    expect(pie).not.toContain("<fieldset");
    expect(pie).not.toContain("<textarea");
  });

  it("Boton en carga anuncia que está ocupado y bloquea otra pulsación", () => {
    const html = renderToStaticMarkup(createElement(Boton, {
      cargando: true, disabled: false,
    }, "Confirmando pedido..."));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Confirmando pedido...");
    expect(html).not.toContain('cargando="');
  });

  it("Boton conserva el estado deshabilitado cuando no está cargando", () => {
    const html = renderToStaticMarkup(createElement(Boton, {
      disabled: true, cargando: false,
    }, "Confirmar pedido"));
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-busy="true"');
  });
});
