import { describe, expect, it } from "vitest";
import {
  alertasStock,
  compararConAyer,
  estadoMesas,
  fechasHoyAyer,
  textoVariacion,
  ticketPromedio,
  ventasPorHora,
} from "../../src/features/dashboard/panel-vivo-logica";

describe("US-099: comparación contra ayer", () => {
  it("calcula la variación porcentual redondeada", () => {
    expect(compararConAyer(120, 100)).toEqual({ hoy: 120, ayer: 100, variacionPct: 20 });
    expect(compararConAyer(75, 100)).toEqual({ hoy: 75, ayer: 100, variacionPct: -25 });
    expect(compararConAyer(1, 3).variacionPct).toBe(-67);
  });

  it("no divide entre cero cuando ayer fue 0", () => {
    expect(compararConAyer(50, 0)).toEqual({ hoy: 50, ayer: 0, variacionPct: null });
    expect(compararConAyer(0, 0).variacionPct).toBeNull();
  });

  it("días sin datos quedan en null (se muestran como —)", () => {
    expect(compararConAyer(null, 100)).toEqual({ hoy: null, ayer: 100, variacionPct: null });
    expect(compararConAyer(4.5, null)).toEqual({ hoy: 4.5, ayer: null, variacionPct: null });
    expect(compararConAyer(Number.NaN, 2).hoy).toBeNull();
  });

  it("arma el texto de la variación", () => {
    expect(textoVariacion(compararConAyer(120, 100))).toBe("+20 % vs ayer");
    expect(textoVariacion(compararConAyer(80, 100))).toBe("−20 % vs ayer");
    expect(textoVariacion(compararConAyer(100, 100))).toBe("Igual que ayer");
    expect(textoVariacion(compararConAyer(10, 0))).toBe("Ayer sin datos");
    expect(textoVariacion(compararConAyer(10, null))).toBe("Sin dato de ayer");
  });
});

describe("US-099: ticket promedio", () => {
  it("divide ventas entre cuentas pagadas y redondea a céntimos", () => {
    expect(ticketPromedio(10_000, 3)).toBe(3333);
    expect(ticketPromedio(5_000, 2)).toBe(2500);
  });
  it("sin cuentas pagadas devuelve 0 (sin dividir entre cero)", () => {
    expect(ticketPromedio(0, 0)).toBe(0);
    expect(ticketPromedio(5_000, 0)).toBe(0);
    expect(ticketPromedio(Number.NaN, 2)).toBe(0);
  });
});

describe("US-099: ventas por hora", () => {
  it("agrupa pagos CONFIRMED por hora de Lima e ignora el resto", () => {
    const horas = ventasPorHora([
      { confirmed_at: "2026-11-17T17:10:00Z", amount: 25, status: "CONFIRMED" }, // 12:10 Lima
      { confirmed_at: "2026-11-17T17:59:00Z", amount: "10.50", status: "CONFIRMED" },
      { confirmed_at: "2026-11-18T01:30:00Z", amount: 40, status: "CONFIRMED" }, // 20:30 Lima
      { confirmed_at: "2026-11-17T17:20:00Z", amount: 99, status: "REJECTED" },
      { confirmed_at: null, amount: 5, status: "CONFIRMED" },
    ]);
    expect(horas).toHaveLength(24);
    expect(horas[12]).toBe(3550);
    expect(horas[20]).toBe(4000);
    expect(horas.reduce((a, b) => a + b, 0)).toBe(7550);
  });
  it("un día sin pagos es todo ceros", () => {
    expect(ventasPorHora([])).toEqual(Array(24).fill(0));
  });
});

describe("US-099: mapa de mesas", () => {
  it("distingue libre, ocupada y espera de pago (US-094)", () => {
    const mesas = estadoMesas(
      [{ id: "m3", numero: 3 }, { id: "m1", numero: 1 }, { id: "m2", numero: 2 }],
      [{ id: "s1", mesaId: "m1" }, { id: "s2", mesaId: "m2" }],
      new Set(["s2"]),
    );
    expect(mesas.map((m) => `${m.numero}:${m.estado}`)).toEqual(["1:OCUPADA", "2:ESPERA_PAGO", "3:LIBRE"]);
  });
});

describe("US-099: alertas de stock", () => {
  it("separa stock bajo y agotados, sin duplicar", () => {
    expect(alertasStock(
      [
        { nombre: "Ceviche", cantidad: 10, vendidos: 8 },
        { nombre: "Chicharrón", cantidad: 5, vendidos: 5 },
        { nombre: "Arroz", cantidad: 20, vendidos: 2 },
        { nombre: "Causa", cantidad: 3, vendidos: 2 },
      ],
      ["Chicharrón", "Leche de tigre"],
    )).toEqual({
      bajo: [{ nombre: "Causa", quedan: 1 }, { nombre: "Ceviche", quedan: 2 }],
      agotados: ["Chicharrón", "Leche de tigre"],
    });
  });
});

describe("US-099: fechas de Lima", () => {
  it("usa el día de Lima, no el de UTC", () => {
    expect(fechasHoyAyer(Date.parse("2026-11-18T01:30:00Z"))).toEqual({ hoy: "2026-11-17", ayer: "2026-11-16" });
    expect(fechasHoyAyer(Date.parse("2026-12-01T12:00:00Z"))).toEqual({ hoy: "2026-12-01", ayer: "2026-11-30" });
  });
});
