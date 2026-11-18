import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  leerEventosPedido,
  leerPromedioCocinaMs,
} from "../../src/features/pedidos/linea-tiempo-datos";

type Respuesta = { data: unknown; error: { code: string } | null };

// Consulta encadenable que registra cada filtro y devuelve la respuesta dada.
function consulta(respuesta: Respuesta) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "in", "gte", "order", "limit"]) {
    q[metodo] = vi.fn(() => q);
  }
  q.overrideTypes = vi.fn(async () => respuesta);
  return q;
}

function cliente(...respuestas: Respuesta[]) {
  const consultas = respuestas.map(consulta);
  let i = 0;
  const from = vi.fn(() => consultas[i++]);
  return { supabase: { from } as never, from, consultas };
}

describe("US-092: datos de la línea de tiempo", () => {
  it("lee solo estado y hora del pedido indicado, sin personal ni motivos", async () => {
    const { supabase, from, consultas } = cliente({
      data: [
        { from_status: null, to_status: "PENDING", created_at: "2026-11-17T17:44:00Z", changed_by: "u1", reason: "x" },
        { from_status: "PENDING", to_status: "IN_PROGRESS", created_at: "2026-11-17T17:45:00Z" },
        { from_status: "X", to_status: "RARO", created_at: "2026-11-17T17:46:00Z" },
      ],
      error: null,
    });

    expect(await leerEventosPedido(supabase, "rest-1", "pedido-1")).toEqual([
      { desde: null, hacia: "PENDING", creadoEn: "2026-11-17T17:44:00Z" },
      { desde: "PENDING", hacia: "IN_PROGRESS", creadoEn: "2026-11-17T17:45:00Z" },
    ]);
    expect(from).toHaveBeenCalledWith("order_status_history");
    expect(consultas[0].select).toHaveBeenCalledWith("from_status, to_status, created_at");
    expect(consultas[0].eq).toHaveBeenCalledWith("restaurant_id", "rest-1");
    expect(consultas[0].eq).toHaveBeenCalledWith("order_id", "pedido-1");
    expect(consultas[0].eq).toHaveBeenCalledWith("event", "STATUS");
  });

  it("si falla el historial registra solo el código y devuelve una lista vacía", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = cliente({ data: null, error: { code: "XX001" } });

    expect(await leerEventosPedido(supabase, "rest-1", "pedido-1")).toEqual([]);
    expect(registro).toHaveBeenCalledExactlyOnceWith("leerEventosPedido", "XX001");
    registro.mockRestore();
  });

  it("calcula el promedio de cocina del restaurante con la lógica de US-081", async () => {
    const ahora = Date.parse("2026-11-17T20:00:00Z");
    const pedidos = ["a", "b", "c"].map((id) => ({ id, status: "DELIVERED", order_items: [] }));
    const historial = [
      ["a", "2026-11-17T17:00:00Z", "2026-11-17T17:10:00Z"],
      ["b", "2026-11-17T18:00:00Z", "2026-11-17T18:20:00Z"],
      ["c", "2026-11-17T19:00:00Z", "2026-11-17T19:15:00Z"],
    ].flatMap(([id, inicio, fin]) => [
      { order_id: id, to_status: "IN_PROGRESS", event: "STATUS", created_at: inicio },
      { order_id: id, to_status: "READY", event: "STATUS", created_at: fin },
    ]);
    const { supabase, consultas } = cliente(
      { data: pedidos, error: null },
      { data: historial, error: null },
    );

    expect(await leerPromedioCocinaMs(supabase, "rest-1", ahora)).toBe(15 * 60_000);
    expect(consultas[0].eq).toHaveBeenCalledWith("restaurant_id", "rest-1");
    expect(consultas[1].eq).toHaveBeenCalledWith("restaurant_id", "rest-1");
    expect(consultas[1].in).toHaveBeenCalledWith("order_id", ["a", "b", "c"]);
  });

  it("devuelve null (valor fijo) con pocos pedidos o si la consulta falla", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pocos = cliente({ data: [{ id: "a", status: "READY", order_items: [] }], error: null });
    expect(await leerPromedioCocinaMs(pocos.supabase, "rest-1", Date.now())).toBeNull();
    expect(pocos.from).toHaveBeenCalledTimes(1);

    const falla = cliente({ data: null, error: { code: "XX002" } });
    expect(await leerPromedioCocinaMs(falla.supabase, "rest-1", Date.now())).toBeNull();
  });
});
