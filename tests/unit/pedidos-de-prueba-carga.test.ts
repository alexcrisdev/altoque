import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// En el servidor de Next, `cache` de React guarda un valor por petición. Aquí se simula
// una sola petición: la primera llamada crea la memoria y las siguientes la reutilizan.
const peticion = vi.hoisted(() => ({ memoria: new Map<unknown, unknown>() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  cache: (crear: () => unknown) => () => {
    if (!peticion.memoria.has(crear)) peticion.memoria.set(crear, crear());
    return peticion.memoria.get(crear);
  },
}));

import { obtenerIdsPedidosDePrueba, ConsultaPedidosDePruebaError } from "../../src/features/dashboard/pedidos-de-prueba";

// Cliente falso: cada consulta paginada devuelve una página con un id (y su count).
function cliente(falla = false) {
  const consulta = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), like: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(async () => falla
      ? { data: null, count: null, error: { code: "XX" } }
      : { data: [{ id: "prueba-1", order_id: "prueba-1" }], count: 1, error: null }),
  };
  return { from: vi.fn().mockReturnValue(consulta) };
}

beforeEach(() => peticion.memoria.clear());

describe("US-145 (US-111): pedidos de prueba clasificados una sola vez por carga", () => {
  it("ventas, tendencias y tiempos de la misma carga comparten la clasificación", async () => {
    const primero = cliente(), segundo = cliente(), tercero = cliente();
    const [a, b, c] = await Promise.all([
      obtenerIdsPedidosDePrueba(primero as never, "r1"),
      obtenerIdsPedidosDePrueba(segundo as never, "r1"),
      obtenerIdsPedidosDePrueba(tercero as never, "r1"),
    ]);
    expect([...a]).toEqual(["prueba-1"]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(primero.from).toHaveBeenCalled();
    expect(segundo.from).not.toHaveBeenCalled();
    expect(tercero.from).not.toHaveBeenCalled();
  });

  it("cada restaurante tiene su propia clasificación", async () => {
    const r1 = cliente(), r2 = cliente();
    await obtenerIdsPedidosDePrueba(r1 as never, "r1");
    await obtenerIdsPedidosDePrueba(r2 as never, "r2");
    expect(r2.from).toHaveBeenCalled();
  });

  it("una clasificación fallida no se guarda: el reintento vuelve a consultar", async () => {
    await expect(obtenerIdsPedidosDePrueba(cliente(true) as never, "r1")).rejects.toBeInstanceOf(ConsultaPedidosDePruebaError);
    const reintento = cliente();
    expect([...await obtenerIdsPedidosDePrueba(reintento as never, "r1")]).toEqual(["prueba-1"]);
    expect(reintento.from).toHaveBeenCalled();
  });

  it("en otra carga (otra petición) se vuelve a clasificar", async () => {
    await obtenerIdsPedidosDePrueba(cliente() as never, "r1");
    peticion.memoria.clear(); // nueva petición
    const nueva = cliente();
    await obtenerIdsPedidosDePrueba(nueva as never, "r1");
    expect(nueva.from).toHaveBeenCalled();
  });
});
