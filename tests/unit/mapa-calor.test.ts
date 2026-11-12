import { describe, expect, it } from "vitest";
import {
  calcularMapaCalor,
  type FiltroMapa,
  type PedidoMapa,
} from "../../src/features/dashboard/mapa-calor-logica";

const filtro: FiltroMapa = {
  desde: "2026-11-02",
  hasta: "2026-11-15",
  horaDesde: 11,
  horaHasta: 13,
  diasAbiertos: [0, 1, 2, 3, 4, 5, 6],
};

const pedido: PedidoMapa = {
  id: "p1",
  creadoEn: "2026-11-02T16:30:00Z",
  cancelado: false,
  productos: ["ceviche"],
};

function celda(
  resultado: ReturnType<typeof calcularMapaCalor>,
  dia: number,
  hora: number,
) {
  return resultado.celdas.find(
    (fila) => fila.dia === dia && fila.hora === hora,
  )!;
}

describe("mapa de calor US-084", () => {
  it("genera los siete días y todas las horas seleccionadas", () => {
    const resultado = calcularMapaCalor([], filtro);

    expect(resultado.celdas).toHaveLength(14);
    expect(resultado.celdas.every((fila) => fila.diasEnRango === 2)).toBe(true);
    expect(resultado.totalPedidos).toBe(0);
    expect(resultado.sugerencias).toEqual([]);
  });

  it("agrupa en hora de Lima y calcula el promedio", () => {
    const resultado = calcularMapaCalor([pedido], filtro);

    expect(celda(resultado, 0, 11)).toMatchObject({
      pedidos: 1,
      promedio: 0.5,
    });
  });

  it("resuelve el cambio de día entre UTC y Lima", () => {
    const resultado = calcularMapaCalor([
      { ...pedido, creadoEn: "2026-11-03T04:30:00Z" },
    ], {
      ...filtro,
      horaDesde: 23,
      horaHasta: 24,
    });

    expect(celda(resultado, 0, 23).pedidos).toBe(1);
    expect(celda(resultado, 1, 23).pedidos).toBe(0);
  });

  it("incluye Desde y excluye las 00:00 del día siguiente a Hasta", () => {
    const resultado = calcularMapaCalor([
      { ...pedido, creadoEn: "2026-11-02T05:00:00Z" },
      { ...pedido, id: "p2", creadoEn: "2026-11-16T04:59:00Z" },
      { ...pedido, id: "p3", creadoEn: "2026-11-16T05:00:00Z" },
    ], {
      ...filtro,
      horaDesde: 0,
      horaHasta: 24,
    });

    expect(resultado.totalPedidos).toBe(2);
  });

  it("excluye cancelados y pedidos fuera del horario", () => {
    const resultado = calcularMapaCalor([
      { ...pedido, cancelado: true },
      { ...pedido, id: "p2", creadoEn: "2026-11-02T15:30:00Z" },
    ], filtro);

    expect(resultado.totalPedidos).toBe(0);
  });

  it("filtra por plato y cuenta cada pedido una sola vez", () => {
    const resultado = calcularMapaCalor([
      { ...pedido, productos: ["ceviche", "ceviche"] },
      { ...pedido, id: "p2", productos: ["pota"] },
      pedido,
    ], {
      ...filtro,
      productoId: "ceviche",
    });

    expect(resultado.totalPedidos).toBe(1);
  });

  it("marca ceros comparables y genera el texto de promoción", () => {
    const resultado = calcularMapaCalor([pedido], filtro);

    expect(celda(resultado, 0, 11).bajaDemanda).toBe(false);
    expect(celda(resultado, 0, 12).bajaDemanda).toBe(true);
    expect(resultado.sugerencias).toContainEqual({
      dia: 0,
      hora: 12,
      texto: "Promoción sugerida: lunes de 12:00 a 13:00",
    });
  });

  it("no recomienda si solo hay una fecha comparable", () => {
    const resultado = calcularMapaCalor([pedido], {
      ...filtro,
      hasta: "2026-11-08",
    });

    expect(resultado.sugerencias).toEqual([]);
  });

  it("no recomienda cuando todas las franjas tienen la misma demanda", () => {
    const resultado = calcularMapaCalor([
      pedido,
      { ...pedido, id: "p2", creadoEn: "2026-11-02T17:30:00Z" },
    ], {
      ...filtro,
      diasAbiertos: [0],
    });

    expect(resultado.sugerencias).toEqual([]);
  });

  it("no cuenta ni recomienda en días configurados como cerrados", () => {
    const resultado = calcularMapaCalor([pedido], {
      ...filtro,
      diasAbiertos: [1],
    });

    expect(celda(resultado, 0, 11).diasEnRango).toBe(0);
    expect(resultado.totalPedidos).toBe(0);
    expect(resultado.sugerencias).toEqual([]);
  });

  it("normaliza según las veces que aparece cada día de semana", () => {
    const resultado = calcularMapaCalor([pedido], {
      ...filtro,
      hasta: "2026-11-16",
    });

    expect(celda(resultado, 0, 11).diasEnRango).toBe(3);
    expect(celda(resultado, 1, 11).diasEnRango).toBe(2);
    expect(celda(resultado, 0, 11).promedio).toBeCloseTo(1 / 3);
  });

  it("rechaza un rango invertido", () => {
    expect(() => calcularMapaCalor([], {
      ...filtro,
      desde: "2026-11-16",
    })).toThrow("posterior");
  });

  it.each([
    { horaDesde: -1 },
    { horaHasta: 25 },
    { horaDesde: 11.5 },
    { horaHasta: 11 },
    { diasAbiertos: [] },
    { diasAbiertos: [7] },
  ])("rechaza un horario inválido %j", (cambio) => {
    expect(() => calcularMapaCalor([], {
      ...filtro,
      ...cambio,
    })).toThrow();
  });

  it.each([
    "fecha-inválida",
    "2026-11-02T11:30:00",
  ])("rechaza fechas inválidas o sin zona: %s", (creadoEn) => {
    expect(() => calcularMapaCalor([
      { ...pedido, creadoEn },
    ], filtro)).toThrow();
  });

  it("no modifica los pedidos recibidos", () => {
    const entrada = [structuredClone(pedido)];
    const copia = structuredClone(entrada);

    calcularMapaCalor(entrada, filtro);

    expect(entrada).toEqual(copia);
  });
});