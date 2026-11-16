import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALERGIA_INICIAL, ALERGENOS, DECLARACION_ALERGIA, leerAlergia, textoAlergia, validarAlergia } from "../../src/features/pedidos/alergias";
import { AvisoAlergia } from "../../src/features/pedidos/aviso-alergia";

const si = { respuesta: "YES", alergenos: ["MANI", "MARISCOS"], detalle: "Evitar contacto", aceptada: true };
describe("US-091: declaración de alergias", () => {
  it.each([undefined, null, {}, ALERGIA_INICIAL, { ...si, respuesta: "OTRA" }])("rechaza respuesta ausente o desconocida: %j", entrada => {
    expect(validarAlergia(entrada).ok).toBe(false);
  });
  it("No permite continuar sin aceptación y no guarda datos innecesarios", () => {
    expect(validarAlergia({ ...ALERGIA_INICIAL, respuesta: "NONE" })).toEqual({ ok: true, alergia: { respuesta: "NONE", alergenos: [], detalle: null } });
  });
  it("normaliza Sí y elimina alérgenos repetidos", () => {
    expect(validarAlergia({ ...si, alergenos: ["MANI", "MANI"], detalle: "  Evitar contacto  " }))
      .toEqual({ ok: true, alergia: { respuesta: "YES", alergenos: ["MANI"], detalle: "Evitar contacto" } });
  });
  it.each(Object.keys(ALERGENOS))("acepta %s", codigo => {
    expect(validarAlergia({ ...si, alergenos: [codigo], detalle: "" }).ok).toBe(true);
  });
  it.each([
    { ...si, aceptada: false }, { ...si, aceptada: "true" },
    { ...si, alergenos: [], detalle: "   " }, { ...si, alergenos: ["OTRO"] },
    { ...si, alergenos: ["__proto__"] }, { ...si, alergenos: [null] },
    { ...si, alergenos: "MANI" }, { ...si, detalle: "x".repeat(121) },
    { ...si, respuesta: "NONE" },
  ])("rechaza datos inválidos: %j", entrada => expect(validarAlergia(entrada).ok).toBe(false));
  it("acepta solo detalle y el límite de 120", () => {
    expect(validarAlergia({ ...si, alergenos: [], detalle: "x".repeat(120) }).ok).toBe(true);
  });
  it("formatea etiquetas españolas y detalle", () => {
    const validado = validarAlergia(si);
    if (!validado.ok) throw new Error("Fixture inválido");
    expect(textoAlergia(validado.alergia)).toBe("Alergia: Maní, Mariscos — Evitar contacto");
    const html = renderToStaticMarkup(createElement(AvisoAlergia, { alergia: validado.alergia }));
    expect(html).toContain("⚠");
    expect(html).toContain("text-peligro-texto");
    expect(html).toContain("Alergia: Maní, Mariscos");
  });
  it("no muestra aviso para pedidos antiguos o No", () => {
    expect(textoAlergia(leerAlergia({}))).toBeNull();
    expect(textoAlergia(leerAlergia({ allergy_answer: "NONE", allergens: [], allergy_note: null }))).toBeNull();
    expect(renderToStaticMarkup(createElement(AvisoAlergia, {}))).toBe("");
  });
  it("escapa el detalle y conserva el texto informativo exacto", () => {
    const html = renderToStaticMarkup(createElement(AvisoAlergia, { alergia: { respuesta: "YES", alergenos: [], detalle: "<script>" } }));
    expect(html).not.toContain("<script>");
    expect(DECLARACION_ALERGIA).toBe("Entiendo que la cocina hará lo posible por evitar el alérgeno, pero puede haber trazas.");
  });
});
