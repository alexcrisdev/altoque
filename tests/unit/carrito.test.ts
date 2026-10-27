import { describe, expect, it } from "vitest";
import {
  cantidadValida,
  calcularSubtotalCentimos,
  calcularTotalCentimos,
} from "../../src/features/pedidos/carrito-logica";
import type { Producto } from "../../src/features/carta/tipos";

const producto: Producto = {
  id: "limonada",
  category_id: "bebidas",
  name: "Limonada",
  description: null,
  price: 8.5,
  image_url: null,
  available: true,
  ingredients: null,
  allergens: [],
};

describe("cantidadValida", () => {
  // Máximo ficticio para probar la función, no una regla del proyecto.
  const maximo = 5;

  it.each([1, 3, 5])("acepta la cantidad %s", (cantidad) => {
    expect(cantidadValida(cantidad, maximo)).toBe(true);
  });

  it.each([0, -1, 1.5, 6, NaN, Infinity])(
    "rechaza la cantidad %s",
    (cantidad) => {
      expect(cantidadValida(cantidad, maximo)).toBe(false);
    },
  );
});

describe("cálculos del carrito", () => {
  it("calcula subtotales en céntimos", () => {
    expect(calcularSubtotalCentimos(8.5, 3)).toBe(2550);
    expect(calcularSubtotalCentimos(0.1, 3)).toBe(30);
  });

  it("rechaza precios y cantidades inválidos", () => {
    expect(() => calcularSubtotalCentimos(-1, 1)).toThrow();
    expect(() => calcularSubtotalCentimos(8.5, 0)).toThrow();
    expect(() => calcularSubtotalCentimos(8.5, 1.5)).toThrow();
  });

  it("suma los subtotales de distintos productos", () => {
    const productos = [
      producto,
      { ...producto, id: "chicha", price: 12 },
    ];

    const items = [
      { productoId: "limonada", cantidad: 2, observacion: null },
      { productoId: "chicha", cantidad: 1, observacion: null },
    ];

    expect(calcularTotalCentimos(items, productos)).toBe(2900);
  });

  it("devuelve cero para un carrito vacío", () => {
    expect(calcularTotalCentimos([], [producto])).toBe(0);
  });

  it("impide calcular un total incompleto si falta un producto", () => {
    const items = [
      { productoId: "inexistente", cantidad: 1, observacion: null },
    ];

    expect(() => calcularTotalCentimos(items, [producto])).toThrow();
  });
});