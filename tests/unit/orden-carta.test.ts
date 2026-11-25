import { describe, expect, it } from "vitest";
import { ordenarProductos } from "../../src/features/carta/orden-productos";
import type { Producto } from "../../src/features/carta/tipos";

function producto(id: string, name: string, available = true, quedan: number | null = null): Producto {
  return { id, name, category_id: "c", description: null, price: 10, image_url: null, available, ingredients: null, allergens: [], quedan };
}

describe("orden de productos de la carta", () => {
  it("ordena disponibles y sin límite antes de agotados, por nombre y con desempate estable", () => {
    const entrada = [producto("z", "Arroz", true, 0), producto("b", "cebiche"), producto("a", "Cebiche"), producto("c", "Ají"), producto("x", "Bebida", false)];
    expect(ordenarProductos(entrada).map((p) => p.id)).toEqual(["c", "a", "b", "z", "x"]);
    expect(entrada[0].id).toBe("z");
  });
  it("ordena alfabéticamente cuando todos están agotados", () => {
    expect(ordenarProductos([producto("1", "Zumo", false), producto("2", "Agua", true, 0)]).map((p) => p.name)).toEqual(["Agua", "Zumo"]);
  });
});
