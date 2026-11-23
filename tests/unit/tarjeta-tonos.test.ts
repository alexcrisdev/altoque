import { describe, expect, it } from "vitest";
import {
  clasesBoton,
  clasesTarjeta,
  type RellenoTarjeta,
  type TonoTarjeta,
} from "../../src/components/ui/clases";

const fondos = (clases: string[]) =>
  clases.filter((clase) => clase.startsWith("bg-"));
const rellenos = (clases: string[]) =>
  clases.filter((clase) => /^(sm:)?p-/.test(clase));

describe("clasesTarjeta", () => {
  it.each<[TonoTarjeta, string, string]>([
    ["neutro", "bg-superficie", "border-borde"],
    ["suave", "bg-superficie-suave", "border-borde"],
    ["exito", "bg-exito-fondo", "border-exito-borde"],
    ["aviso", "bg-aviso-fondo", "border-aviso-borde"],
    ["info", "bg-info-fondo", "border-info-borde"],
    ["peligro", "bg-peligro-fondo", "border-peligro-borde"],
  ])("aplica fondo y borde del tono %s", (tono, fondo, borde) => {
    const clases = clasesTarjeta(tono).split(" ");

    expect(fondos(clases)).toEqual([fondo]);
    expect(clases).toContain(borde);
  });

  it.each<[RellenoTarjeta, string[]]>([
    ["compacto", ["p-4"]],
    ["normal", ["p-5"]],
    ["amplio", ["p-6"]],
    ["destacado", ["p-6", "sm:p-9"]],
  ])("aplica el relleno %s", (relleno, esperado) => {
    const clases = clasesTarjeta("neutro", relleno).split(" ");

    expect(rellenos(clases)).toEqual(esperado);
  });

  it("usa neutro y normal por defecto", () => {
    expect(clasesTarjeta()).toBe(clasesTarjeta("neutro", "normal"));
  });

  it("mantiene la clase tarjeta y el color de texto en todos los tonos", () => {
    for (const tono of ["neutro", "suave", "exito", "aviso", "info", "peligro"]) {
      const clases = clasesTarjeta(tono).split(" ");

      expect(clases).toContain("tarjeta");
      expect(clases).toContain("text-texto");
      expect(clases).toContain("border");
    }
  });

  it.each(["desconocido", "__proto__", "toString", null, undefined, 123])(
    "usa neutro y normal ante el valor %s",
    (valor) => {
      expect(clasesTarjeta(valor, valor)).toBe(
        clasesTarjeta("neutro", "normal"),
      );
    },
  );
});

describe("clasesBoton variante exito", () => {
  it("mantiene el aspecto del botón Llegó completo", () => {
    const clases = clasesBoton("exito").split(" ");

    expect(clases).toEqual(
      expect.arrayContaining([
        "border-exito-borde",
        "bg-exito-fondo",
        "text-exito-texto",
        "hover:bg-exito-fondo",
      ]),
    );
    expect(fondos(clases)).toEqual(["bg-exito-fondo"]);
    expect(clases).not.toContain("bg-marca");
    expect(clases.some((clase) => clase.endsWith("!"))).toBe(false);
  });

  it("conserva altura mínima, foco y disabled", () => {
    const clases = clasesBoton("exito", "lg").split(" ");

    expect(clases).toContain("min-h-11");
    expect(clases).toContain("focus-visible:outline-marca");
    expect(clases).toContain("disabled:pointer-events-none");
  });
});
