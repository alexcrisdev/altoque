import { describe, expect, it } from "vitest";
import { mensajeStockInsuficiente } from "../../src/features/pedidos/stock-mensaje";

describe("mensaje de stock insuficiente", () => {
  it("muestra el producto y las unidades que quedan", () => {
    expect(mensajeStockInsuficiente(
      "STOCK_INSUFFICIENT:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:2",
      [{ productoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nombre: "Ceviche" }],
    )).toBe("Ya no hay Ceviche, quedan 2.");
  });

  it("ignora errores que no son de stock o productos desconocidos", () => {
    const productos = [{ productoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nombre: "Ceviche" }];
    expect(mensajeStockInsuficiente("PRODUCT_UNAVAILABLE", productos)).toBeNull();
    expect(mensajeStockInsuficiente(
      "STOCK_INSUFFICIENT:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:0",
      productos,
    )).toBeNull();
  });
});
