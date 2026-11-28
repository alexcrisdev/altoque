import { describe, expect, it } from "vitest";
import { validarProducto, type EntradaProducto } from "../../src/features/carta/validar-producto";

const entradaBase: EntradaProducto = {
  nombre: "  Ceviche  ",
  precio: "12.50",
  categoriaId: "123e4567-e89b-42d3-a456-426614174000",
  descripcion: "  Fresco  ",
  ingredientes: "  Pescado, limón  ",
  alergenos: "  Pescado, limón ",
  imageUrl: "https://example.com/ceviche.jpg",
};

describe("validarProducto", () => {
  it("recorta y normaliza los campos válidos", () => {
    expect(validarProducto(entradaBase)).toEqual({
      ok: true,
      producto: {
        name: "Ceviche",
        price: 12.5,
        categoryId: entradaBase.categoriaId,
        description: "Fresco",
        ingredients: "Pescado, limón",
        allergens: ["Pescado", "limón"],
        imageUrl: "https://example.com/ceviche.jpg",
        alcoholPercent: null,
        volumeMl: null,
      },
    });
  });

  it("requiere nombre y recorta antes de validar el máximo de 80 caracteres", () => {
    expect(validarProducto({ ...entradaBase, nombre: "   " })).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } });
    expect(validarProducto({ ...entradaBase, nombre: ` ${"a".repeat(81)} ` })).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } });
    expect(validarProducto({ ...entradaBase, nombre: ` ${"a".repeat(80)} ` })).toMatchObject({ ok: true, producto: { name: "a".repeat(80) } });
  });

  it.each(["", "0", "-1", "1,25", "1.234", "texto", "1e2", "$2.00"])(
    "rechaza el precio inválido %s",
    (precio) => expect(validarProducto({ ...entradaBase, precio })).toMatchObject({ ok: false, errores: { precio: expect.any(String) } }),
  );

  it.each(["0.01", "1", "12.5", "12.50", "99999999.99"])(
    "acepta el precio en soles %s",
    (precio) => expect(validarProducto({ ...entradaBase, precio })).toMatchObject({ ok: true }),
  );

  it("convierte descripciones e ingredientes vacíos o con espacios en null", () => {
    expect(validarProducto({ ...entradaBase, descripcion: "   ", ingredientes: "\n " })).toMatchObject({
      ok: true,
      producto: { description: null, ingredients: null },
    });
  });

  it("limpia tokens vacíos y elimina alérgenos repetidos sin distinguir mayúsculas", () => {
    expect(validarProducto({ ...entradaBase, alergenos: " Pescado, , pescado,  Limón " })).toMatchObject({
      ok: true,
      producto: { allergens: ["Pescado", "Limón"] },
    });
  });

  it("rechaza más de 14 alérgenos distintos", () => {
    const alergenos = Array.from({ length: 15 }, (_, i) => `Alergeno ${i + 1}`).join(",");
    expect(validarProducto({ ...entradaBase, alergenos })).toMatchObject({ ok: false, errores: { alergenos: expect.any(String) } });
  });

  it("exige una categoría válida", () => {
    expect(validarProducto({ ...entradaBase, categoriaId: "abc" })).toMatchObject({ ok: false, errores: { categoriaId: expect.any(String) } });
  });

  it("acepta el ID de categoría del seed aunque no indique una versión RFC", () => {
    expect(validarProducto({ ...entradaBase, categoriaId: "40000000-0000-0000-0000-000000000001" })).toMatchObject({
      ok: true,
      producto: { categoryId: "40000000-0000-0000-0000-000000000001" },
    });
  });

  it("permite URL vacía y exige HTTPS para imágenes", () => {
    expect(validarProducto({ ...entradaBase, imageUrl: "  " })).toMatchObject({ ok: true, producto: { imageUrl: null } });
    expect(validarProducto({ ...entradaBase, imageUrl: "http://example.com/a.jpg" })).toMatchObject({ ok: false, errores: { imageUrl: expect.any(String) } });
    expect(validarProducto({ ...entradaBase, imageUrl: "not a url" })).toMatchObject({ ok: false, errores: { imageUrl: expect.any(String) } });
  });
});

// US-156: bebidas con alcohol.
describe("validarProducto: bebidas con alcohol", () => {
  const cerveza = { ...entradaBase, nombre: "Cusqueña 620 ml", porcentajeAlcohol: "5", ml: "620" };

  it("en «Bebidas con alcohol» pide % y ml y los guarda", () => {
    expect(validarProducto(cerveza, { conAlcohol: true })).toMatchObject({ ok: true, producto: { alcoholPercent: 5, volumeMl: 620 } });
    expect(validarProducto({ ...cerveza, porcentajeAlcohol: "4,8" }, { conAlcohol: true })).toMatchObject({ ok: true, producto: { alcoholPercent: 4.8 } });
  });

  it.each([
    [{ porcentajeAlcohol: "" }, "porcentajeAlcohol"],
    [{ porcentajeAlcohol: "101" }, "porcentajeAlcohol"],
    [{ porcentajeAlcohol: "5.25" }, "porcentajeAlcohol"],
    [{ porcentajeAlcohol: "-1" }, "porcentajeAlcohol"],
    [{ ml: "" }, "ml"],
    [{ ml: "0" }, "ml"],
    [{ ml: "5001" }, "ml"],
    [{ ml: "620.5" }, "ml"],
  ])("rechaza %o", (cambio, campo) => {
    expect(validarProducto({ ...cerveza, ...cambio }, { conAlcohol: true })).toMatchObject({ ok: false, errores: { [campo]: expect.any(String) } });
  });

  it("en otra categoría ignora % y ml (se guardan null)", () => {
    expect(validarProducto(cerveza)).toMatchObject({ ok: true, producto: { alcoholPercent: null, volumeMl: null } });
    expect(validarProducto({ ...cerveza, ml: "basura" })).toMatchObject({ ok: true, producto: { volumeMl: null } });
  });
});
