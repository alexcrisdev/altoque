import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImagenProducto } from "../../src/components/imagen-producto";
import { DetalleProducto } from "../../src/features/carta/detalle-producto";
import type { Producto } from "../../src/features/carta/tipos";

describe("imágenes y detalle de la carta", () => {
  it("muestra la imagen válida y usa el respaldo cuando no hay imagen", () => {
    const valida = renderToStaticMarkup(createElement(ImagenProducto, { src: "https://example.com/plato.jpg", nombre: "Plato" }));
    const ausente = renderToStaticMarkup(createElement(ImagenProducto, { src: null, nombre: "Plato" }));
    expect(valida).toContain("https://example.com/plato.jpg");
    expect(ausente).toContain("/images/plato-predeterminado.svg");
  });

  it("deshabilita el detalle cuando el stock es cero aunque la marca esté activa", () => {
    const producto: Producto = { id: "1", category_id: "c", name: "Plato", description: null, price: 10,
      image_url: null, available: true, ingredients: null, allergens: [], quedan: 0 };
    const html = renderToStaticMarkup(createElement(DetalleProducto, { producto, dialogoRef: createRef<HTMLDialogElement>(), onAgregar: () => {}, aviso: "" }));
    expect(html).toContain("Producto agotado");
    expect(html).toContain("disabled");
  });
});
