import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerTiemposCocina } from "../../src/features/dashboard/tiempos-cocina";

const dia = "2026-11-12";
const candidato = { id: "h1", order_id: "p1" };
const historial = [
  { ...candidato, event: "STATUS", to_status: "IN_PROGRESS", created_at: "2026-11-13T04:30:00Z" },
  { ...candidato, id: "h2", event: "STATUS", to_status: "READY", created_at: "2026-11-13T05:30:00Z" },
];
const pedido = { id: "p1", status: "READY", order_items: [{ product_name: "Ceviche" }] };
type Respuesta = { data: unknown[] | null; count: number | null; error: unknown };
const respuesta = (data: unknown[], count = data.length): Respuesta => ({ data, count, error: null });
function simular(respuestas: Respuesta[]) {
  const consultas: ReturnType<typeof crearConsulta>[] = [];
  function crearConsulta() {
    return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockImplementation(async () => respuestas.shift()),
    };
  }
  const cliente = { from: vi.fn().mockImplementation(() => {
    const consulta = crearConsulta(); consultas.push(consulta); return consulta;
  }) };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  return { cliente, consultas };
}
const consultar = () => obtenerTiemposCocina("r1", dia, dia);
beforeEach(() => vi.resetAllMocks());
describe("consulta de tiempos US-081", () => {
  it("filtra restaurante, eventos y fechas, recuperando el final fuera del rango", async () => {
    const { cliente, consultas } = simular([respuesta([candidato]), respuesta(historial), respuesta([pedido])]);
    expect((await consultar()).total?.promedioMs).toBe(3600000);
    expect(cliente.from.mock.calls.map(([tabla]) => tabla)).toEqual(["order_status_history", "order_status_history", "orders"]);
    for (const consulta of consultas) expect(consulta.eq).toHaveBeenCalledWith("restaurant_id", "r1");
    expect(consultas[0].gte).toHaveBeenCalledWith("created_at", "2026-11-12T05:00:00.000Z");
    expect(consultas[0].lt).toHaveBeenCalledWith("created_at", "2026-11-13T05:00:00.000Z");
    expect(consultas[1].eq).toHaveBeenCalledWith("event", "STATUS");
    expect(consultas[1].gte).not.toHaveBeenCalled();
    expect(consultas[1].lt).not.toHaveBeenCalled();
    expect(consultas[1].in).toHaveBeenCalledWith("order_id", ["p1"]);
    expect(consultas[2].neq).toHaveBeenCalledWith("status", "CANCELLED");
  });
  it("pagina candidatos e historial en bloques de 500 sin perder el READY", async () => {
    const candidatos = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, order_id: "p1" }));
    const eventos = Array.from({ length: 500 }, (_, i) => ({ ...historial[0], id: `e${i}` }));
    const { consultas } = simular([
      respuesta(candidatos, 501), respuesta([{ id: "c500", order_id: "p1" }], 501),
      respuesta(eventos, 501), respuesta([historial[1]], 501), respuesta([pedido]),
    ]);
    expect((await consultar()).total?.promedioMs).toBe(3600000);
    expect(consultas.map((c) => c.range.mock.calls[0])).toEqual([[0, 499], [500, 999], [0, 499], [500, 999], [0, 499]]);
  });
  it("divide los pedidos en lotes y conserva los resultados de todos", async () => {
    const candidatos = Array.from({ length: 101 }, (_, i) => ({ id: `h${i}`, order_id: `p${i}` }));
    const datos = (inicio: number, fin: number) => candidatos.slice(inicio, fin).flatMap((c) =>
      historial.map((h, i) => ({ ...h, id: `${c.id}-${i}`, order_id: c.order_id })));
    const pedidos = candidatos.map((c) => ({ ...pedido, id: c.order_id }));
    const { consultas } = simular([respuesta(candidatos), respuesta(datos(0, 100)), respuesta(pedidos.slice(0, 100)),
      respuesta(datos(100, 101)), respuesta(pedidos.slice(100))]);
    expect((await consultar()).total?.pedidos).toBe(101);
    expect(consultas[1].in.mock.calls[0][1]).toHaveLength(100);
    expect(consultas[3].in.mock.calls[0][1]).toHaveLength(1);
  });
  it("sin candidatos no consulta pedidos", async () => {
    const { cliente } = simular([respuesta([])]);
    expect((await consultar()).total).toBeNull();
    expect(cliente.from).toHaveBeenCalledTimes(1);
  });
  it.each([
    { data: null, count: null, error: null },
    { data: [], count: 1, error: null },
    { data: [], count: 0, error: { code: "error" } },
    respuesta([candidato, candidato]),
  ])("rechaza respuestas incompletas o repetidas: %j", async (res) => {
    simular([res]);
    await expect(consultar()).rejects.toThrow();
  });
  it("rechaza conteos que cambian entre páginas", async () => {
    simular([respuesta([candidato], 2), respuesta([{ ...candidato, id: "otro" }], 3)]);
    await expect(consultar()).rejects.toThrow();
  });
  it("valida restaurante y fechas sin conectarse", async () => {
    await expect(obtenerTiemposCocina("", dia, dia)).rejects.toThrow();
    await expect(obtenerTiemposCocina("r1", "inválida", dia)).rejects.toThrow();
    expect(crearClienteServidor).not.toHaveBeenCalled();
  });
});
