import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerCarta } from "../../src/features/carta/carta";
import { CartaInteractiva } from "../../src/features/carta/carta-interactiva";

const categoria = { id: "categoria-1", name: "Platos" };
const producto = {
  id: "producto-1",
  category_id: categoria.id,
  name: "Ceviche",
  description: null,
  price: "25.00",
  image_url: null,
  available: false,
  ingredients: null,
  allergens: [],
};

function query(resultado: { data: unknown[]; error: null }) {
  const consulta = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue(resultado),
  };
  return consulta;
}

beforeEach(() => vi.resetAllMocks());

describe("disponibilidad en la carta QR", () => {
  it("incluye agotados para mostrar su estado y filtra los productos desactivados", async () => {
    const categorias = query({ data: [categoria], error: null });
    const productos = query({ data: [producto], error: null });
    const from = vi.fn((tabla: string) => tabla === "categories" ? categorias : productos);
    vi.mocked(crearClienteAdmin).mockReturnValue({ from } as never);

    const carta = await obtenerCarta("restaurante-1");

    expect(carta.productos).toEqual([{ ...producto, price: 25 }]);
    expect(productos.eq).toHaveBeenCalledWith("restaurant_id", "restaurante-1");
    expect(productos.eq).toHaveBeenCalledWith("active", true);
    expect(productos.select).toHaveBeenCalledWith(
      "id, category_id, name, description, price, image_url, available, ingredients, allergens",
    );
    expect(carta.productos[0].available).toBe(false);

    const markup = renderToStaticMarkup(createElement(CartaInteractiva, {
      categorias: [{ ...categoria, productos: carta.productos }],
    }));
    expect(markup).toContain("Agotado");
  });
});
