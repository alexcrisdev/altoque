import { describe, expect, it } from "vitest";
import {
  agregarAlCarrito,
  cambiarCantidad,
  cambiarObservacion,
  cantidadValida,
  quitarDelCarrito,
  calcularSubtotalCentimos,
  calcularTotalCentimos,
} from "../../src/features/pedidos/carrito-logica";
import type { Producto } from "../../src/features/carta/tipos";
import {
  LIMITES,
  type ItemCarrito,
} from "../../src/features/pedidos/tipos";

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

function crearItem(
  cambios: Partial<ItemCarrito> = {},
): ItemCarrito {
  return {
    productoId: producto.id,
    cantidad: 1,
    observacion: null,
    ...cambios,
  };
}

describe("cantidadValida", () => {
  it.each([1, 3, 20])("acepta la cantidad %s", (cantidad) => {
    expect(cantidadValida(cantidad)).toBe(true);
  });

  it.each([0, -1, 1.5, 21, NaN, Infinity])(
    "rechaza la cantidad %s",
    (cantidad) => {
      expect(cantidadValida(cantidad)).toBe(false);
    },
  );
});

describe("agregarAlCarrito", () => {
  it("agrega un producto disponible sin modificar el carrito original", () => {
    const items: ItemCarrito[] = [];

    expect(agregarAlCarrito(items, producto)).toEqual([
      crearItem(),
    ]);
    expect(items).toEqual([]);
  });

  it("aumenta la cantidad y conserva la observación", () => {
    const items = [crearItem({ observacion: "Sin hielo" })];

    expect(agregarAlCarrito(items, producto)).toEqual([
      crearItem({ cantidad: 2, observacion: "Sin hielo" }),
    ]);
    expect(items[0].cantidad).toBe(1);
  });

  it("permite llegar a 20 unidades y rechaza una adicional", () => {
    const items = [crearItem({ cantidad: 19 })];
    const resultado = agregarAlCarrito(items, producto);

    expect(resultado[0].cantidad).toBe(20);
    expect(agregarAlCarrito(resultado, producto)).toEqual(resultado);
  });

  it("permite 30 productos distintos y rechaza el siguiente", () => {
    const items = Array.from({ length: 29 }, (_, indice) =>
      crearItem({ productoId: `producto-${indice}` }),
    );

    const resultado = agregarAlCarrito(items, producto);

    expect(resultado).toHaveLength(30);
    expect(
      agregarAlCarrito(resultado, { ...producto, id: "nuevo" }),
    ).toEqual(resultado);
    expect(items).toHaveLength(29);
  });

  it("permite aumentar un producto existente con 30 productos distintos", () => {
    const items = [
      crearItem(),
      ...Array.from({ length: LIMITES.itemsMax - 1 }, (_, indice) =>
        crearItem({ productoId: `producto-${indice}` }),
      ),
    ];

    const resultado = agregarAlCarrito(items, producto);

    expect(resultado).toHaveLength(30);
    expect(resultado[0].cantidad).toBe(2);
  });

  it("no agrega ni incrementa productos agotados", () => {
    const agotado = { ...producto, available: false };
    const items = [crearItem()];

    expect(agregarAlCarrito([], agotado)).toEqual([]);
    expect(agregarAlCarrito(items, agotado)).toEqual(items);
  });
});

describe("cambiarCantidad", () => {
  it("actualiza la cantidad sin modificar el original", () => {
    const items = [crearItem()];

    expect(cambiarCantidad(items, producto, 20)).toEqual([
      crearItem({ cantidad: 20 }),
    ]);
    expect(items[0].cantidad).toBe(1);
  });

  it.each([0, -1, 1.5, 21, NaN, Infinity])(
    "rechaza la cantidad %s",
    (cantidad) => {
      const items = [crearItem()];

      expect(cambiarCantidad(items, producto, cantidad)).toEqual(items);
    },
  );

  it("permite reducir un agotado, pero impide aumentarlo", () => {
    const items = [crearItem({ cantidad: 2 })];
    const agotado = { ...producto, available: false };

    expect(cambiarCantidad(items, agotado, 1)[0].cantidad).toBe(1);
    expect(cambiarCantidad(items, agotado, 3)).toEqual(items);
  });
});

describe("quitarDelCarrito", () => {
  it("elimina solo el producto indicado sin modificar el original", () => {
    const items = [
      crearItem(),
      crearItem({ productoId: "chicha" }),
    ];

    expect(quitarDelCarrito(items, producto.id)).toEqual([
      crearItem({ productoId: "chicha" }),
    ]);
    expect(items).toHaveLength(2);
  });
});

describe("cambiarObservacion", () => {
  it.each(["", "   ", "\t\n"])(
    "convierte el texto vacío o con espacios a null",
    (texto) => {
      const items = [crearItem({ observacion: "Sin hielo" })];

      expect(
        cambiarObservacion(items, producto.id, texto, true)[0]
          .observacion,
      ).toBeNull();
      expect(items[0].observacion).toBe("Sin hielo");
    },
  );

  it("conserva los espacios mientras se escribe una observación", () => {
    const items = [crearItem()];

    const resultado = cambiarObservacion(
      items,
      producto.id,
      "Sin hielo ",
      true,
    );

    expect(resultado[0].observacion).toBe("Sin hielo ");
    expect(items[0].observacion).toBeNull();
  });

  it("acepta 140 caracteres y rechaza más de 140", () => {
    const texto = "a".repeat(140);
    const items = cambiarObservacion(
      [crearItem()],
      producto.id,
      texto,
      true,
    );

    expect(items[0].observacion).toBe(texto);
    expect(
      cambiarObservacion(items, producto.id, "b".repeat(141), true),
    ).toEqual(items);
  });

  it("no modifica observaciones cuando están deshabilitadas", () => {
    const items = [crearItem()];

    expect(
      cambiarObservacion(items, producto.id, "Sin hielo", false),
    ).toEqual(items);
  });
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
    expect(() => calcularSubtotalCentimos(8.5, 21)).toThrow();
  });

  it("suma los subtotales de distintos productos", () => {
    const productos = [
      producto,
      { ...producto, id: "chicha", price: 12 },
    ];

    const items = [
      crearItem({ cantidad: 2 }),
      crearItem({ productoId: "chicha" }),
    ];

    expect(calcularTotalCentimos(items, productos)).toBe(2900);
  });

  it("devuelve cero para un carrito vacío", () => {
    expect(calcularTotalCentimos([], [producto])).toBe(0);
  });

  it("impide calcular un total incompleto si falta un producto", () => {
    const items = [crearItem({ productoId: "inexistente" })];

    expect(() => calcularTotalCentimos(items, [producto])).toThrow();
  });
});