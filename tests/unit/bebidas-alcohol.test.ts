import { describe, expect, it } from "vitest";
import {
  mlValidos, porcentajeAlcoholValido, textoTragosEstandar, tragosEstandar, tragosEstandarRedondeado,
} from "../../src/features/carta/bebidas-alcohol";

// US-156 (y US-160): tragos estándar = ml × % / 100 × 0.789 / 10.
describe("tragos estándar", () => {
  it.each([
    [620, 5, 2.4],     // Cusqueña 620 ml
    [355, 5, 1.4],     // lata de 355 ml
    [50, 40, 1.6],     // pisco, un shot
    [150, 12, 1.4],    // copa de vino
  ])("%i ml al %i %% ≈ %d tragos", (ml, pct, esperado) => {
    expect(tragosEstandarRedondeado(ml, pct)).toBe(esperado);
  });

  it("valor exacto sin redondear", () => {
    expect(tragosEstandar(620, 5)).toBeCloseTo(2.4459, 4);
  });

  it("texto para la pantalla", () => {
    expect(textoTragosEstandar(355, 5)).toBe("≈ 1.4 tragos estándar");
    expect(textoTragosEstandar(127, 10)).toBe("≈ 1.0 trago estándar");
    expect(textoTragosEstandar(0, 5)).toBeNull();
  });

  it.each([[0, 5], [5001, 5], [500, -1], [500, 101], [Number.NaN, 5]])("datos inválidos (%d ml, %d %%) → null", (ml, pct) => {
    expect(tragosEstandar(ml, pct)).toBeNull();
  });

  it("rangos de la base", () => {
    expect(porcentajeAlcoholValido(1.1)).toBe(true);
    expect(porcentajeAlcoholValido(5.25)).toBe(false);
    expect(porcentajeAlcoholValido(100)).toBe(true);
    expect(mlValidos(620)).toBe(true);
    expect(mlValidos(620.5)).toBe(false);
    expect(mlValidos(0)).toBe(false);
  });
});
