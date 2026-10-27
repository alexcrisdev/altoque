import { describe, expect, it } from "vitest";
import { agruparPorCategoria, formatearPrecio } from "../../src/features/carta/formato";
import type { Producto } from "../../src/features/carta/tipos";

const categorias = [
  { id: "bebidas", name: "Bebidas" },
  { id: "ceviches", name: "Ceviches" },
  { id: "vacia", name: "Sin productos" },
];
const producto: Producto = {
  id: "limonada", category_id: "bebidas", name: "Limonada",
  description: null, price: 8.5, image_url: null, available: true, ingredients: null, allergens: [],
};

describe("formatearPrecio", () => {
  it.each([0, 8.5, 25, 1234.56])("formatea %s en soles con dos decimales", (precio) => {
    const esperado = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(precio);
    expect(formatearPrecio(precio)).toBe(esperado);
    expect(formatearPrecio(precio)).toContain("S/");
  });

  it("redondea a céntimos", () => {
    expect(formatearPrecio(10.456)).toBe(formatearPrecio(10.46));
  });
});

describe("agruparPorCategoria", () => {
  it("conserva el orden de categorías, agrupa productos y omite categorías vacías", () => {
    const ceviche = { ...producto, id: "ceviche", category_id: "ceviches" };
    expect(agruparPorCategoria(categorias, [ceviche, producto])).toEqual([
      { ...categorias[0], productos: [producto] },
      { ...categorias[1], productos: [ceviche] },
    ]);
  });

  it("conserva productos agotados y campos opcionales", () => {
    const agotado = { ...producto, available: false };
    expect(agruparPorCategoria(categorias, [agotado])[0].productos).toEqual([agotado]);
  });

  it("no incorpora productos de categorías ausentes", () => {
    expect(agruparPorCategoria(categorias, [{ ...producto, category_id: "otra" }])).toEqual([]);
  });

  it("devuelve una lista vacía cuando no hay categorías o productos", () => {
    expect(agruparPorCategoria([], [producto])).toEqual([]);
    expect(agruparPorCategoria(categorias, [])).toEqual([]);
  });

  it("no modifica las listas originales y conserva varios productos de una categoría", () => {
    const entradas = Object.freeze([Object.freeze(producto), Object.freeze({ ...producto, id: "chicha" })]);
    const resultado = agruparPorCategoria(Object.freeze(categorias), entradas);
    expect(resultado[0].productos).toEqual(entradas);
    expect(resultado[0]).not.toBe(categorias[0]);
    expect(categorias[0]).not.toHaveProperty("productos");
  });
});
