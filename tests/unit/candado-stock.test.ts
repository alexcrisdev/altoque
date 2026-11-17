import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import {
  agregarAlCarrito,
  ajustarADisponible,
  aplicarDisponibilidad,
  cambiarCantidad,
  hayLineasConProblema,
  problemaDeLinea,
  quitarDelCarrito,
} from "../../src/features/pedidos/carrito-logica";
import { calcularDisponibilidad } from "../../src/features/carta/carta";
import { Carrito } from "../../src/features/pedidos/carrito";
import type { DisponibilidadProducto, Producto } from "../../src/features/carta/tipos";
import type { ItemCarrito } from "../../src/features/pedidos/tipos";

function producto(id: string, cambios: Partial<Producto> = {}): Producto {
  return {
    id,
    category_id: "platos",
    name: id,
    description: null,
    price: 20,
    image_url: null,
    available: true,
    ingredients: null,
    allergens: [],
    ...cambios,
  };
}

const ceviche = producto("ceviche");
const lomo = producto("lomo");
const items: ItemCarrito[] = [
  { productoId: "ceviche", cantidad: 3, observacion: "sin cebolla" },
  { productoId: "lomo", cantidad: 1, observacion: null },
];

function stock(...filas: DisponibilidadProducto[]) {
  return new Map(filas.map((fila) => [fila.id, fila]));
}

describe("US-103: disponibilidad en vivo", () => {
  it("calcula lo que queda con el stock del día", () => {
    expect(calcularDisponibilidad(true, undefined)).toEqual({ available: true, quedan: null });
    expect(calcularDisponibilidad(true, { product_id: "x", quantity: 10, sold: 7 })).toEqual({ available: true, quedan: 3 });
    expect(calcularDisponibilidad(true, { product_id: "x", quantity: 5, sold: 5 })).toEqual({ available: false, quedan: 0 });
    expect(calcularDisponibilidad(false, { product_id: "x", quantity: 5, sold: 1 })).toEqual({ available: false, quedan: 4 });
  });

  it("aplica la consulta solo a los productos que cambiaron", () => {
    const vivos = aplicarDisponibilidad(
      [ceviche, lomo],
      stock({ id: "ceviche", available: false, quedan: 0 }),
    );
    expect(vivos[0]).toMatchObject({ id: "ceviche", available: false, quedan: 0, name: "ceviche" });
    expect(vivos[1]).toBe(lomo);
  });
});

describe("US-103: líneas del carrito con problema", () => {
  it("marca la línea agotada y la quita sin tocar las demás", () => {
    const agotado = { ...ceviche, available: false, quedan: 0 };
    expect(problemaDeLinea(items[0], agotado)).toEqual({ tipo: "AGOTADO" });
    expect(problemaDeLinea(items[1], lomo)).toBeNull();

    const restantes = quitarDelCarrito(items, "ceviche");
    expect(restantes).toEqual([items[1]]);
  });

  it("si se pidió más de lo que queda, «Dejar N» ajusta solo esa línea", () => {
    const quedanDos = { ...ceviche, quedan: 2 };
    expect(problemaDeLinea(items[0], quedanDos)).toEqual({ tipo: "EXCEDE", quedan: 2 });

    const ajustados = ajustarADisponible(items, quedanDos);
    expect(ajustados).toEqual([
      { productoId: "ceviche", cantidad: 2, observacion: "sin cebolla" },
      items[1],
    ]);
    expect(problemaDeLinea(ajustados[0], quedanDos)).toBeNull();
  });

  it("«Dejar» con cero unidades quita la línea", () => {
    expect(ajustarADisponible(items, { ...ceviche, quedan: 0 })).toEqual([items[1]]);
  });

  it("bloquea enviar mientras haya líneas agotadas, excedidas o fuera de la carta", () => {
    expect(hayLineasConProblema(items, [ceviche, lomo])).toBe(false);
    expect(hayLineasConProblema(items, [{ ...ceviche, available: false }, lomo])).toBe(true);
    expect(hayLineasConProblema(items, [{ ...ceviche, quedan: 2 }, lomo])).toBe(true);
    expect(hayLineasConProblema(items, [lomo])).toBe(true);
    expect(hayLineasConProblema(items, [{ ...ceviche, quedan: 3 }, lomo])).toBe(false);
  });

  it("no deja agregar ni subir por encima de lo que queda", () => {
    const quedanTres = { ...ceviche, quedan: 3 };
    expect(agregarAlCarrito(items, quedanTres)).toBe(items);
    expect(cambiarCantidad(items, quedanTres, 4)).toEqual(items);
    // Bajar siempre se puede.
    expect(cambiarCantidad(items, { ...ceviche, quedan: 1 }, 2)[0].cantidad).toBe(2);
    expect(agregarAlCarrito([], { ...ceviche, quedan: 0 })).toEqual([]);
  });

  it("el carrito muestra el candado con «Quitar» y «Solo quedan N» con «Dejar N»", () => {
    const html = renderToStaticMarkup(createElement(Carrito, {
      items,
      productos: [{ ...ceviche, quedan: 2 }, { ...lomo, available: false, quedan: 0 }],
      cantidadMaxima: 20,
      observacionesHabilitadas: false,
      observacionMaxima: 140,
      onCambiarCantidad: () => {},
      onEliminar: () => {},
      onCambiarObservacion: () => {},
    }));
    expect(html).toContain("Solo quedan 2");
    expect(html).toContain("Dejar 2");
    expect(html).toContain("Agotado");
    expect(html).toContain("Quitar");
  });
});
