import { describe, expect, it } from "vitest";
import {
  clasesBoton,
  clasesInsignia,
} from "../../src/components/ui/clases";
import type { TonoInsignia } from "../../src/components/ui/insignia";
import { TONO_ESTADO } from "../../src/features/pedidos/estados";

describe("clasesBoton", () => {
  it.each([
    ["primario", "bg-marca"],
    ["secundario", "bg-superficie"],
    ["peligro", "bg-peligro"],
    ["fantasma", "bg-transparent"],
  ])("aplica la variante %s", (variante, clase) => {
    expect(clasesBoton(variante).split(" ")).toContain(clase);
  });

  it.each([
    ["primario", "md"],
    ["primario", "lg"],
    ["secundario", "md"],
    ["secundario", "lg"],
    ["peligro", "md"],
    ["peligro", "lg"],
    ["fantasma", "md"],
    ["fantasma", "lg"],
  ])(
    "mantiene altura mínima, foco y disabled en %s, %s",
    (variante, tamano) => {
      const clases = clasesBoton(variante, tamano).split(" ");

      expect(clases).toContain("min-h-11");
      expect(clases).toContain("focus-visible:outline-marca");
      expect(clases).toContain("disabled:pointer-events-none");
      expect(clases).toContain("disabled:opacity-50");
    },
  );

  it("diferencia los tamaños", () => {
    expect(clasesBoton("primario", "md").split(" ")).toContain(
      "text-sm",
    );
    expect(clasesBoton("primario", "lg").split(" ")).toContain(
      "min-h-12",
    );
  });

  it.each(["desconocido", "__proto__", null, undefined, 123])(
    "usa opciones seguras ante el valor %s",
    (valor) => {
      expect(clasesBoton(valor, valor, valor)).toBe(
        clasesBoton("primario", "md"),
      );
    },
  );

  // US-132: variantes, tamaños y esquinas de los botones migrados.
  it.each([
    ["contorno", ["border-borde", "bg-transparent"]],
    ["peligro-contorno", ["border-peligro-borde", "bg-transparent", "text-peligro-texto"]],
    ["transparente", ["border-transparent", "bg-transparent"]],
    ["enlace", ["border-transparent", "bg-transparent", "underline"]],
  ])("aplica la variante %s", (variante, esperadas) => {
    expect(clasesBoton(variante).split(" ")).toEqual(expect.arrayContaining(esperadas));
  });

  it.each(["contorno", "transparente", "enlace"])(
    "la variante %s no fija color de texto para conservar el del botón original",
    (variante) => {
      expect(clasesBoton(variante).split(" ").filter((c) => c.startsWith("text-") && !["text-center", "text-sm"].includes(c))).toEqual([]);
    },
  );

  it.each(["md", "lg", "icono", "propio", "xl"])(
    "garantiza al menos 44 px de alto y de ancho con el tamaño %s",
    (tamano) => {
      const clases = clasesBoton("primario", tamano).split(" ");
      expect(clases).toContain("min-w-11");
      expect(clases.some((c) => c === "min-h-11" || c === "min-h-14")).toBe(true);
    },
  );

  it("el tamaño icono es un cuadrado de 44 × 44 px", () => {
    expect(clasesBoton("secundario", "icono").split(" ")).toEqual(
      expect.arrayContaining(["size-11", "min-h-11", "p-0"]),
    );
  });

  it("el tamaño propio no impone relleno ni tipografía", () => {
    const clases = clasesBoton("primario", "propio").split(" ");
    expect(clases.filter((c) => /^(p[xy]?-|font-|text-(xs|sm|base|lg))/.test(c))).toEqual([]);
  });

  it.each([
    [undefined, "rounded-xl"],
    ["xl", "rounded-xl"],
    ["lg", "rounded-lg"],
    ["sm", "rounded"],
  ])("aplica la esquina %s", (esquina, clase) => {
    const radios = clasesBoton("primario", "md", esquina).split(" ").filter((c) => c.startsWith("rounded"));
    expect(radios).toEqual([clase]);
  });

  it("la esquina ninguna no añade radio ni espacios vacíos", () => {
    const clases = clasesBoton("enlace", "propio", "ninguna");
    expect(clases.split(" ").some((c) => c.startsWith("rounded"))).toBe(false);
    expect(clases).not.toMatch(/\s{2,}/);
  });

  it("md y lg conservan su tipografía y altura anteriores", () => {
    expect(clasesBoton("primario", "md").split(" ")).toEqual(
      expect.arrayContaining(["min-h-11", "font-semibold", "text-sm", "rounded-xl"]),
    );
    expect(clasesBoton("primario", "lg").split(" ")).toEqual(
      expect.arrayContaining(["min-h-11", "min-h-12", "font-semibold", "text-base", "rounded-xl"]),
    );
  });
});

describe("clasesInsignia", () => {
  const tonos: TonoInsignia[] = [
    "neutro",
    "info",
    "aviso",
    "progreso",
    "exito",
    "peligro",
  ];

  it.each(tonos)("aplica los colores del tono %s", (tono) => {
    const clases = clasesInsignia(tono).split(" ");

    expect(clases).toContain(`bg-${tono}-fondo`);
    expect(clases).toContain(`border-${tono}-borde`);
    expect(clases).toContain(`text-${tono}-texto`);
  });

  it.each(["desconocido", "__proto__", null, undefined, 123])(
    "usa el tono neutro ante el valor %s",
    (valor) => {
      expect(clasesInsignia(valor)).toBe(
        clasesInsignia("neutro"),
      );
    },
  );

  it("admite todos los tonos usados por los estados del pedido", () => {
    for (const tono of Object.values(TONO_ESTADO)) {
      expect(tonos).toContain(tono);
      expect(clasesInsignia(tono).split(" ")).toContain(
        `bg-${tono}-fondo`,
      );
    }
  });
});