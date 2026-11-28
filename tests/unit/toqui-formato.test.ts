import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analizarMensaje, MensajeFormateado, partesEnLinea } from "../../src/components/toqui/formato";

// US-152: Toqui muestra **negritas** y viñetas «- » sin asteriscos ni HTML crudo.
const html = (texto: string) => renderToStaticMarkup(createElement(MensajeFormateado, { texto }));

describe("partesEnLinea", () => {
  it("convierte **texto** en negrita", () => {
    expect(partesEnLinea("Hoy vendiste **S/ 840.50** hasta las 15:40.")).toEqual([
      { texto: "Hoy vendiste ", negrita: false },
      { texto: "S/ 840.50", negrita: true },
      { texto: " hasta las 15:40.", negrita: false },
    ]);
  });

  it("un «**» sin pareja queda como texto", () => {
    expect(partesEnLinea("2 ** 3 es potencia")).toEqual([{ texto: "2 ** 3 es potencia", negrita: false }]);
    expect(partesEnLinea("**Hoy** y **mañana")).toEqual([
      { texto: "Hoy", negrita: true },
      { texto: " y **mañana", negrita: false },
    ]);
  });
});

describe("analizarMensaje", () => {
  it("agrupa las líneas que empiezan con «- » en una lista y el resto en párrafos", () => {
    expect(analizarMensaje("En los últimos 7 días:\n- **Lomo saltado**: 40\n- Ceviche: 35\n\nBuen ritmo.")).toEqual([
      { tipo: "parrafo", partes: [{ texto: "En los últimos 7 días:", negrita: false }] },
      { tipo: "lista", items: [
        [{ texto: "Lomo saltado", negrita: true }, { texto: ": 40", negrita: false }],
        [{ texto: "Ceviche: 35", negrita: false }],
      ] },
      { tipo: "parrafo", partes: [{ texto: "Buen ritmo.", negrita: false }] },
    ]);
  });

  it("«-» sin espacio (un número negativo) no es viñeta", () => {
    expect(analizarMensaje("-5 % vs ayer")[0].tipo).toBe("parrafo");
  });
});

describe("MensajeFormateado", () => {
  it("arma <strong>, <ul> y <li> sin asteriscos", () => {
    const salida = html("Hoy fue **bueno**:\n- Ventas: **S/ 840**\n- Pedidos: 15");
    expect(salida).toBe("<p><span>Hoy fue </span><strong>bueno</strong><span>:</span></p>"
      + "<ul><li><span>Ventas: </span><strong>S/ 840</strong></li><li><span>Pedidos: 15</span></li></ul>");
    expect(salida).not.toContain("**");
  });

  it("el HTML que venga en el texto se muestra como texto (no se ejecuta)", () => {
    const salida = html("**<img src=x onerror=alert(1)>** <script>alert(1)</script>");
    expect(salida).not.toContain("<img");
    expect(salida).not.toContain("<script");
    expect(salida).toContain("&lt;script&gt;");
  });

  it("no usa dangerouslySetInnerHTML", () => {
    for (const archivo of ["formato.tsx", "toqui.tsx"]) {
      expect(readFileSync(`src/components/toqui/${archivo}`, "utf8")).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
    }
  });
});
