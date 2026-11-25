import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerSatisfaccionDia } from "../../src/features/dashboard/satisfaccion";

beforeEach(() => vi.resetAllMocks());

function preparar(filas: { service_stars: number; waiter_stars: number }[], error: object | null = null) {
  const q = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(), range: vi.fn() };
  for (const metodo of ["select", "eq", "gte", "lt", "order"] as const) q[metodo].mockReturnValue(q);
  q.range.mockResolvedValue({ data: filas, error });
  const marcas = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), like: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
  };
  vi.mocked(crearClienteServidor).mockResolvedValue({
    from: vi.fn((tabla: string) => tabla === "order_ratings" ? q : marcas),
  } as never);
  return q;
}

it("no inventa cero estrellas cuando no hay opiniones", async () => {
  preparar([]);
  expect(await obtenerSatisfaccionDia("rest", "2026-11-17")).toEqual({ cantidad: 0, servicio: null, mesero: null });
});

it("promedia ambos indicadores y filtra restaurante y día de Lima", async () => {
  const q = preparar([{ service_stars: 5, waiter_stars: 3 }, { service_stars: 3, waiter_stars: 5 }]);
  expect(await obtenerSatisfaccionDia("rest", "2026-11-17")).toEqual({ cantidad: 2, servicio: 4, mesero: 4 });
  expect(q.eq).toHaveBeenCalledWith("restaurant_id", "rest");
  expect(q.gte).toHaveBeenCalledWith("created_at", "2026-11-17T05:00:00.000Z");
  expect(q.lt).toHaveBeenCalledWith("created_at", "2026-11-18T05:00:00.000Z");
});

it("incluye más de una página de opiniones", async () => {
  const q = preparar([]);
  q.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ service_stars: 5, waiter_stars: 4 })), error: null })
    .mockResolvedValueOnce({ data: [{ service_stars: 1, waiter_stars: 1 }], error: null });
  const r = await obtenerSatisfaccionDia("rest", "2026-11-17");
  expect(r.cantidad).toBe(501);
  expect(r.servicio).toBeCloseTo(2501 / 501);
  expect(q.range).toHaveBeenNthCalledWith(2, 500, 999);
});

it("distingue error de consulta de ausencia de opiniones", async () => {
  preparar([], { code: "ERROR" });
  await expect(obtenerSatisfaccionDia("rest", "2026-11-17")).rejects.toThrow();
});
