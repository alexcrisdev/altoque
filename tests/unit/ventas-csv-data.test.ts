import { beforeEach, describe, expect, it, vi } from "vitest";

const { crearClienteServidor } = vi.hoisted(() => ({
  crearClienteServidor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor }));

import { crearCsvVentas } from "../../src/features/dashboard/ventas-csv-logica";
import { obtenerFilasVentasCsv } from "../../src/features/dashboard/ventas-csv";
import { calcularResumenVentas } from "../../src/features/dashboard/ventas-logica";

const pagosParciales = [
  {
    id: "pago-1", order_id: null, table_session_id: "sesion-mesa-1",
    amount: "10.00", confirmed_at: "2026-11-12T16:00:00.000Z",
  },
  {
    id: "pago-2", order_id: null, table_session_id: "sesion-mesa-1",
    amount: "5.00", confirmed_at: "2026-11-12T16:15:00.000Z",
  },
];

const eq = vi.fn();
const gte = vi.fn();
const lt = vi.fn();
const select = vi.fn();
const order = vi.fn();
const range = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  const consulta = { select, eq, gte, lt, order, range };
  for (const metodo of [select, eq, gte, lt, order]) metodo.mockReturnValue(consulta);
  range.mockResolvedValue({ data: pagosParciales, error: null, count: pagosParciales.length });
  from.mockReturnValue(consulta);
  crearClienteServidor.mockResolvedValue({ from });
});

describe("datos de exportación CSV por pago", () => {
  it("exporta dos pagos parciales en dos filas sin repetir productos o cantidades", async () => {
    const filas = await obtenerFilasVentasCsv(
      "restaurante-1", "2026-11-12", "2026-11-12",
    );
    const csv = crearCsvVentas(filas);
    const registros = csv.replace(/^\uFEFF/, "").trim().split("\r\n").slice(1);
    const importes = registros.map((fila) => Number(fila.split(",").at(-1)));
    const totalDashboard = calcularResumenVentas(pagosParciales.map((pago) => ({
      table_session_id: pago.table_session_id,
      order_id: pago.order_id,
      method: "CASH" as const,
      status: "CONFIRMED" as const,
      amount: pago.amount,
    }))).ventasCentimos;

    expect(registros).toHaveLength(2);
    expect(registros.some((fila) => fila.includes('"pago-1"'))).toBe(true);
    expect(registros.some((fila) => fila.includes('"pago-2"'))).toBe(true);
    expect(registros.every((fila) => fila.includes("sesion-mesa-1"))).toBe(true);
    expect(csv).not.toMatch(/producto|cantidad|pizza/i);
    expect(importes).toEqual([10, 5]);
    expect(Math.round(importes.reduce((suma, importe) => suma + importe, 0) * 100)).toBe(totalDashboard);
  });

  it("usa el restaurante, estado y rango de confirmación del dashboard", async () => {
    await obtenerFilasVentasCsv("restaurante-autorizado", "2026-11-12", "2026-11-12");

    expect(from).toHaveBeenCalledExactlyOnceWith("payments");
    expect(eq).toHaveBeenCalledWith("restaurant_id", "restaurante-autorizado");
    expect(eq).toHaveBeenCalledWith("status", "CONFIRMED");
    expect(gte).toHaveBeenCalledWith("confirmed_at", "2026-11-12T05:00:00.000Z");
    expect(lt).toHaveBeenCalledWith("confirmed_at", "2026-11-13T05:00:00.000Z");
    expect(select).toHaveBeenCalledWith(
      "id, order_id, table_session_id, amount, confirmed_at",
      { count: "exact" },
    );
  });
});
