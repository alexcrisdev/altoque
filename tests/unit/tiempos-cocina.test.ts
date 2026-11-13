import { describe, expect, it } from "vitest";
import { calcularTiemposCocina, type EventoCocina, type PedidoCocina } from "../../src/features/dashboard/tiempos-cocina-logica";

const dia = "2026-11-12";
const pedido: PedidoCocina = { id: "p1", status: "READY", order_items: [{ product_name: "Ceviche" }] };
const evento = (to_status: string, hora: string, order_id = "p1", event = "STATUS"): EventoCocina => ({
  order_id, to_status, event, created_at: `${dia}T${hora}:00-05:00`,
});
const normal = [evento("IN_PROGRESS", "12:00"), evento("READY", "12:10")];
const calcular = (historial = normal, pedidos = [pedido], desde = dia, hasta = dia) =>
  calcularTiemposCocina(pedidos, historial, desde, hasta);

describe("tiempos de cocina US-081", () => {
  it("mide el flujo directo y agrupa en Lima", () => {
    const resultado = calcular();
    expect(resultado.total).toEqual({ pedidos: 1, promedioMs: 600000, maximoMs: 600000 });
    expect(resultado.porDia[0].nombre).toBe(dia);
    expect(resultado.porFranja[0].nombre).toBe("12:00–12:59");
  });
  it("usa el último READY después de deshacer", () => {
    expect(calcular([...normal, evento("IN_PROGRESS", "12:11"), evento("READY", "12:20")])
      .total?.promedioMs).toBe(1200000);
  });
  it("excluye un READY deshecho que todavía está en preparación", () => {
    expect(calcular([...normal, evento("IN_PROGRESS", "12:11")], [{ ...pedido, status: "IN_PROGRESS" }]).total).toBeNull();
  });
  it("rechaza un historial con preparación posterior al último READY", () => {
    expect(calcular([...normal, evento("IN_PROGRESS", "12:11")]).total).toBeNull();
  });
  it("no mide PENDING ni ACCEPTED en pedidos antiguos", () => {
    expect(calcular([evento("PENDING", "10:00"), evento("ACCEPTED", "11:00"), ...normal])
      .total?.promedioMs).toBe(600000);
  });
  it("excluye cancelados aunque tengan READY", () => {
    expect(calcular(normal, [{ ...pedido, status: "CANCELLED" }]).total).toBeNull();
  });
  it("incluye entregados con historial completo", () => {
    expect(calcular(normal, [{ ...pedido, status: "DELIVERED" }]).total?.pedidos).toBe(1);
  });
  it.each([{ historial: [normal[0]] }, { historial: [normal[1]] }, { historial: [] }])("no inventa extremos ausentes: %j", ({ historial }) => {
    expect(calcular(historial).total).toBeNull();
  });
  it("ignora modificaciones y orden de llegada", () => {
    expect(calcular([evento("IN_PROGRESS", "12:30", "p1", "MODIFIED"), ...normal.toReversed()]))
      .toEqual(calcular());
  });
  it("usa el día de Lima a las 23:30 y conserva READY fuera del rango", () => {
    const resultado = calcular([evento("IN_PROGRESS", "23:30"), {
      ...evento("READY", "00:30"), created_at: "2026-11-13T05:30:00Z",
    }]);
    expect(resultado.total?.promedioMs).toBe(3600000);
    expect(resultado.porDia[0].nombre).toBe(dia);
    expect(resultado.porFranja[0].nombre).toBe("23:00–23:59");
  });
  it("filtra por el primer ingreso aunque exista una reentrada dentro del rango", () => {
    expect(calcular([{ ...normal[0], created_at: "2026-11-11T23:00:00-05:00" }, ...normal]).total).toBeNull();
  });
  it("incluye inicio del día y excluye inicio del siguiente", () => {
    expect(calcular([evento("IN_PROGRESS", "00:00"), normal[1]]).total?.pedidos).toBe(1);
    expect(calcular(normal, [pedido], "2026-11-11", "2026-11-11").total).toBeNull();
  });
  it("calcula promedio y máximo sin duplicar el mismo plato en un pedido", () => {
    const resultado = calcular([...normal, evento("IN_PROGRESS", "13:00", "p2"), evento("READY", "13:20", "p2")],
      [{ ...pedido, order_items: [...pedido.order_items, ...pedido.order_items] }, { ...pedido, id: "p2" }]);
    expect(resultado.porPlato).toEqual([{ nombre: "Ceviche", pedidos: 2, promedioMs: 900000, maximoMs: 1200000 }]);
    expect(resultado.porDia[0]).toMatchObject({ pedidos: 2, promedioMs: 900000, maximoMs: 1200000 });
    expect(resultado.porFranja).toHaveLength(2);
  });
  it("no muestra ceros sin datos", () => {
    expect(calcular([], [])).toEqual({ total: null, porDia: [], porFranja: [], porPlato: [] });
  });
  it("rechaza rangos inválidos", () => {
    expect(() => calcular(normal, [pedido], "2026-02-30")).toThrow();
    expect(() => calcular(normal, [pedido], "2026-11-13", dia)).toThrow();
  });
  it("excluye fechas inválidas y duraciones negativas", () => {
    expect(calcular([{ ...normal[0], created_at: "inválida" }, normal[1]]).total).toBeNull();
    expect(calcular([evento("IN_PROGRESS", "13:00"), normal[1]]).total).toBeNull();
  });
});
