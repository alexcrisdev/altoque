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
      expect(clasesBoton(valor, valor)).toBe(
        clasesBoton("primario", "md"),
      );
    },
  );
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