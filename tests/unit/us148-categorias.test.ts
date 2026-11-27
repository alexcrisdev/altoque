import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOGO_CATEGORIAS,
  categoriasParaFormulario,
  imagenCategoria,
  tarjetasCategorias,
  textoConteo,
} from "../../src/features/carta/categorias-admin";
import { agruparPorCategoria } from "../../src/features/carta/formato";
import { calcularDisponibilidad } from "../../src/features/carta/carta";
import { estaAgotado } from "../../src/features/pedidos/carrito-logica";
import type { Producto } from "../../src/features/carta/tipos";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

const entradas = { id: "entradas", name: "Entradas", active: true };
const sopas = { id: "sopas", name: "Sopas y caldos", active: true };
const ceviches = { id: "ceviches", name: "Ceviches", active: false };
const pollos = { id: "pollos", name: "Pollos", active: true };

const plato = (id: string, category_id: string, extra: Partial<{ active: boolean; agotado: boolean }> = {}) =>
  ({ id, category_id, active: true, agotado: false, ...extra });

describe("US-148: tarjetas de categoría del dueño", () => {
  it("cuenta platos y agotados por categoría", () => {
    const [tarjeta] = tarjetasCategorias([entradas], [
      plato("a", "entradas"), plato("b", "entradas"), plato("c", "entradas", { agotado: true }),
    ]);
    expect(tarjeta.resumen).toBe("3 platos · 1 agotado");
    expect(tarjeta).toMatchObject({ platos: 3, agotados: 1 });
  });

  it("no cuenta los platos desactivados de la carta", () => {
    const [tarjeta] = tarjetasCategorias([entradas], [
      plato("a", "entradas"), plato("b", "entradas", { active: false, agotado: true }),
    ]);
    expect(tarjeta.resumen).toBe("1 plato");
  });

  it("escribe singular, plural y sin agotados", () => {
    expect(textoConteo(0, 0)).toBe("0 platos");
    expect(textoConteo(1, 1)).toBe("1 plato · 1 agotado");
    expect(textoConteo(5, 2)).toBe("5 platos · 2 agotados");
  });

  it("respeta el orden del catálogo y muestra las categorías estándar aunque estén vacías", () => {
    const tarjetas = tarjetasCategorias([entradas, sopas, pollos], [plato("p", "pollos")]);
    expect(tarjetas.map((t) => [t.name, t.resumen])).toEqual([
      ["Entradas", "0 platos"], ["Sopas y caldos", "0 platos"], ["Pollos", "1 plato"],
    ]);
  });

  it("oculta una categoría antigua desactivada y sin platos", () => {
    expect(tarjetasCategorias([entradas, ceviches], []).map((t) => t.id)).toEqual(["entradas"]);
    expect(tarjetasCategorias([ceviches], [plato("x", "ceviches")]).map((t) => t.id)).toEqual(["ceviches"]);
  });

  it("el formulario solo ofrece categorías activas, en el mismo orden", () => {
    expect(categoriasParaFormulario([entradas, ceviches, sopas]).map((c) => c.id)).toEqual(["entradas", "sopas"]);
  });

  it("al editar, incluye la categoría actual del plato aunque esté inactiva; al crear, no", () => {
    expect(categoriasParaFormulario([entradas, ceviches, sopas], "ceviches").map((c) => c.id))
      .toEqual(["entradas", "ceviches", "sopas"]);
    expect(categoriasParaFormulario([entradas, ceviches, sopas], "entradas").map((c) => c.id))
      .toEqual(["entradas", "sopas"]);
  });

  it("cada categoría estándar tiene su imagen en public/ y las demás usan una genérica", () => {
    for (const { nombre } of CATALOGO_CATEGORIAS) {
      const ruta = imagenCategoria(nombre);
      expect(ruta).not.toBe("/categorias/otras.svg");
      expect(existsSync(join(process.cwd(), "public", ruta))).toBe(true);
    }
    expect(imagenCategoria("Pollos")).toBe("/categorias/otras.svg");
    expect(existsSync(join(process.cwd(), "public", "categorias", "otras.svg"))).toBe(true);
  });
});

describe("US-148: carta del cliente", () => {
  const producto = (id: string, category_id: string): Producto => ({
    id, category_id, name: id, description: null, price: 10, image_url: null,
    available: true, ingredients: null, allergens: [],
  });

  it("muestra las categorías en el orden del catálogo y oculta las que no tienen platos activos", () => {
    const grupos = agruparPorCategoria(
      [{ id: "entradas", name: "Entradas" }, { id: "sopas", name: "Sopas y caldos" }, { id: "bebidas", name: "Bebidas sin alcohol" }],
      [producto("chicha", "bebidas"), producto("ceviche", "entradas")],
    );
    expect(grupos.map((g) => g.name)).toEqual(["Entradas", "Bebidas sin alcohol"]);
  });

  it("un plato con stock 0 queda agotado (candado) y no se puede agregar", () => {
    const disponibilidad = calcularDisponibilidad(true, { product_id: "p", quantity: 5, sold: 5 });
    expect(disponibilidad).toEqual({ available: false, quedan: 0 });
    expect(estaAgotado({ ...producto("p", "entradas"), ...disponibilidad })).toBe(true);
  });
});
