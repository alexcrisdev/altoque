import { describe, expect, it } from "vitest";
import { compararConAyer, corteComparacion, textoVariacion } from "../../src/features/dashboard/panel-vivo-logica";
import { calcularTiemposCocina, type EventoCocina } from "../../src/features/dashboard/tiempos-cocina-logica";

describe("US-112: misma hora en Lima", () => {
  it("compara hasta un único instante, conservando segundos y milisegundos", () => {
    expect(corteComparacion(Date.parse("2026-11-26T20:30:42.123Z"))).toEqual({
      hoy: "2026-11-26", ayer: "2026-11-25", horaCorte: "15:30",
      desdeHoyUtc: "2026-11-26T05:00:00.000Z", desdeAyerUtc: "2026-11-25T05:00:00.000Z",
      corteHoyUtc: "2026-11-26T20:30:42.123Z", corteAyerUtc: "2026-11-25T20:30:42.123Z",
    });
  });
  it.each([
    ["2026-11-27T04:59:59.999Z", "2026-11-26", "2026-11-25", "23:59"],
    ["2026-11-27T05:00:00.000Z", "2026-11-27", "2026-11-26", "00:00"],
    ["2027-01-01T05:00:00.000Z", "2027-01-01", "2026-12-31", "00:00"],
    ["2028-03-01T17:00:00.000Z", "2028-03-01", "2028-02-29", "12:00"],
  ])("respeta el calendario local en %s", (instante, hoy, ayer, horaCorte) => {
    const corte = corteComparacion(Date.parse(instante));
    expect(corte).toMatchObject({ hoy, ayer, horaCorte });
    expect(Date.parse(corte.corteHoyUtc) - Date.parse(corte.desdeHoyUtc))
      .toBe(Date.parse(corte.corteAyerUtc) - Date.parse(corte.desdeAyerUtc));
  });
  it("rechaza un instante inválido", () => {
    expect(() => corteComparacion(NaN)).toThrow();
    expect(() => corteComparacion(Infinity)).toThrow();
  });
  it("muestra el corte en variaciones positivas, negativas y sin cambio", () => {
    expect(textoVariacion(compararConAyer(120, 100), "15:30")).toBe("+20 % vs. ayer hasta las 15:30");
    expect(textoVariacion(compararConAyer(80, 100), "15:30")).toBe("−20 % vs. ayer hasta las 15:30");
    expect(textoVariacion(compararConAyer(100, 100), "15:30")).toBe("Igual que ayer hasta las 15:30");
  });
  it("distingue cero ventas de una consulta que no pudo obtener datos", () => {
    expect(textoVariacion(compararConAyer(40, 0), "15:30", "Ayer sin ventas"))
      .toBe("Ayer sin ventas hasta las 15:30");
    expect(textoVariacion(compararConAyer(0, 0), "00:00", "Ayer sin ventas")).not.toContain("%");
    expect(textoVariacion(compararConAyer(null, 0), "15:30")).toBe("Comparación no disponible");
    expect(textoVariacion(compararConAyer(10, null), "15:30")).toBe("Comparación no disponible");
  });
});

describe("US-112: cocina conocida al corte", () => {
  const pedido = { id: "p", status: "DELIVERED", order_items: [{ product_name: "Plato" }] };
  const evento = (to_status: string, hora: string): EventoCocina => ({
    order_id: "p", event: "STATUS", to_status, created_at: `2026-11-25T${hora}Z`,
  });
  const inicio = evento("IN_PROGRESS", "20:00:00");
  const calcular = (historial: EventoCocina[], status = "DELIVERED") =>
    calcularTiemposCocina([{ ...pedido, status }], historial, "2026-11-25", "2026-11-25", "2026-11-25T20:30:00Z");
  it("incluye un READY anterior al corte", () => {
    expect(calcular([inicio, evento("READY", "20:20:00")]).total?.promedioMs).toBe(20 * 60_000);
  });
  it.each(["20:30:00", "20:31:00"])("excluye un READY a las %s, igual o posterior al límite", (hora) => {
    expect(calcular([inicio, evento("READY", hora)]).total).toBeNull();
  });
  it("un READY deshecho antes del corte no cuenta aunque termine después", () => {
    expect(calcular([inicio, evento("READY", "20:10:00"), evento("IN_PROGRESS", "20:15:00"), evento("READY", "20:40:00")]).total).toBeNull();
  });
  it("reconstruye el estado al corte y no usa un deshacer posterior", () => {
    expect(calcular([inicio, evento("READY", "20:10:00"), evento("IN_PROGRESS", "20:40:00")], "IN_PROGRESS")
      .total?.promedioMs).toBe(10 * 60_000);
  });
  it("si está cancelado actualmente, lo excluye", () => {
    expect(calcular([inicio, evento("READY", "20:10:00")], "CANCELLED").total).toBeNull();
  });
  it("los reportes sin corte conservan el final fuera del día de inicio", () => {
    const historial = [inicio, { ...evento("READY", "20:10:00"), created_at: "2026-11-26T06:00:00Z" }];
    expect(calcularTiemposCocina([pedido], historial, "2026-11-25", "2026-11-25").total?.promedioMs).toBe(10 * 3600_000);
  });
});
