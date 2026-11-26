import { describe, expect, it } from "vitest";
import { resumenFranjas } from "../../src/features/dashboard/mapa-calor-logica";

const base = { dia: 0, hora: 12, pedidos: 0, diasEnRango: 4, promedio: 0, bajaDemanda: false };

describe("Resumen de franjas", () => {
  it("excluye cierres y usa el promedio, conservando el primer empate", () => {
    const pico = { ...base, pedidos: 4, diasEnRango: 1, promedio: 4 };
    const media = { ...base, pedidos: 8, promedio: 2 };
    const floja = { ...base, dia: 2 };
    expect(resumenFranjas([{ ...base, diasEnRango: 0 }, pico, media, floja, { ...floja, dia: 3 }])).toEqual({ pico, floja });
  });
  it("omite extremos para periodos vacíos o uniformes", () => {
    expect(resumenFranjas([])).toBeNull();
    expect(resumenFranjas([base])).toBeNull();
    expect(resumenFranjas([base, { ...base, dia: 1 }])).toBeNull();
  });
});
