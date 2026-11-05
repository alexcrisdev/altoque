import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../src/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(),
}));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerTendencias } from "../../src/features/dashboard/tendencias";
import type { PedidoTendencia } from "../../src/features/dashboard/tendencias-logica";

const restauranteId = "restaurante-autorizado";
const desde = "2026-11-04";
const hasta = "2026-11-04";

function crearPedido(
  cambios: Partial<PedidoTendencia> = {},
): PedidoTendencia {
  return {
    id: "pedido-1",
    created_at: "2026-11-04T15:00:00.000Z",
    status: "PENDING",
    order_items: [
      {
        product_id: "producto-1",
        product_name: "Ceviche",
        quantity: 2,
      },
    ],
    ...cambios,
  };
}

type Respuesta = {
  data: PedidoTendencia[] | null;
  error: { code: string } | null;
  count: number | null;
};

function simularConsulta(respuestas: Respuesta[]) {
  const consulta = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn(),
  };

  for (const respuesta of respuestas) {
    consulta.overrideTypes.mockResolvedValueOnce(respuesta);
  }

  const cliente = {
    from: vi.fn().mockReturnValue(consulta),
  };

  vi.mocked(crearClienteServidor).mockResolvedValue(
    cliente as unknown as Awaited<
      ReturnType<typeof crearClienteServidor>
    >,
  );

  return { cliente, consulta };
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consulta de tendencias US-019", () => {
  it("consulta pedidos e items con restaurante y límites de Lima", async () => {
    const { cliente, consulta } = simularConsulta([
      { data: [crearPedido()], error: null, count: 1 },
    ]);

    const resultado = await obtenerTendencias(
      restauranteId,
      desde,
      hasta,
    );

    expect(resultado.productos).toEqual([
      { productId: "producto-1", nombre: "Ceviche", unidades: 2 },
    ]);
    expect(resultado.total).toBe(1);

    expect(cliente.from).toHaveBeenCalledExactlyOnceWith("orders");
    expect(consulta.select).toHaveBeenCalledExactlyOnceWith(
      "id, status, created_at, order_items(product_id, product_name, quantity)",
      { count: "exact" },
    );

    // No filtramos CANCELLED en la consulta: cuenta por estado.
    expect(consulta.eq).toHaveBeenCalledExactlyOnceWith(
      "restaurant_id",
      restauranteId,
    );

    expect(consulta.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-11-04T05:00:00.000Z",
    );
    expect(consulta.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-11-05T05:00:00.000Z",
    );
    expect(consulta.order).toHaveBeenCalledWith(
      "id",
      { ascending: true },
    );
    expect(consulta.range).toHaveBeenCalledWith(0, 499);
  });

  it("conserva cancelados en el conteo, pero los excluye del top", async () => {
    simularConsulta([
      {
        data: [
          crearPedido(),
          crearPedido({ id: "cancelado", status: "CANCELLED" }),
        ],
        error: null,
        count: 2,
      },
    ]);

    const resultado = await obtenerTendencias(
      restauranteId,
      desde,
      hasta,
    );

    expect(resultado.total).toBe(2);
    expect(resultado.porEstado.PENDING).toBe(1);
    expect(resultado.porEstado.CANCELLED).toBe(1);
    expect(resultado.productos[0].unidades).toBe(2);
  });

  it("sin pedidos devuelve top vacío y los seis estados en cero", async () => {
    simularConsulta([{ data: [], error: null, count: 0 }]);

    expect(
      await obtenerTendencias(restauranteId, desde, hasta),
    ).toEqual({
      productos: [],
      porEstado: {
        PENDING: 0,
        ACCEPTED: 0,
        IN_PROGRESS: 0,
        READY: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
      total: 0,
    });
  });

  it("no consulta un rango inválido", async () => {
    await expect(
      obtenerTendencias(
        restauranteId,
        "2026-11-05",
        "2026-11-04",
      ),
    ).rejects.toThrow("posterior");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("no consulta sin restaurante", async () => {
    await expect(
      obtenerTendencias("", desde, hasta),
    ).rejects.toThrow("identificar el restaurante");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("agrupa productos entre páginas y elige el nombre más reciente", async () => {
    const reciente = crearPedido({
      id: "pedido-2",
      created_at: "2026-11-04T18:00:00.000Z",
      status: "DELIVERED",
      order_items: [
        {
          product_id: "producto-1",
          product_name: "Ceviche especial",
          quantity: 3,
        },
      ],
    });

    const { consulta } = simularConsulta([
      { data: [crearPedido()], error: null, count: 2 },
      { data: [reciente], error: null, count: 2 },
    ]);

    const resultado = await obtenerTendencias(
      restauranteId,
      desde,
      hasta,
    );

    expect(resultado.productos).toEqual([
      {
        productId: "producto-1",
        nombre: "Ceviche especial",
        unidades: 5,
      },
    ]);
    expect(resultado.total).toBe(2);

    // Continúa aunque una página entregue menos de 500 filas.
    expect(consulta.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
    ]);
  });

  it("lanza error en lugar de confundir una consulta fallida con cero pedidos", async () => {
    const registro = vi.spyOn(console, "error")
      .mockImplementation(() => {});

    simularConsulta([
      { data: null, error: { code: "XX001" }, count: null },
    ]);

    await expect(
      obtenerTendencias(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las tendencias");

    expect(registro).toHaveBeenCalledExactlyOnceWith(
      "obtenerTendencias",
      "XX001",
    );
  });

  it("no devuelve resultados parciales si falla otra página", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    simularConsulta([
      { data: [crearPedido()], error: null, count: 2 },
      { data: null, error: { code: "XX002" }, count: null },
    ]);

    await expect(
      obtenerTendencias(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las tendencias");
  });

  it("rechaza un resultado incompleto", async () => {
    simularConsulta([
      { data: [], error: null, count: 1 },
    ]);

    await expect(
      obtenerTendencias(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las tendencias");
  });

  it("rechaza cambios de conteo entre páginas", async () => {
    simularConsulta([
      { data: [crearPedido()], error: null, count: 2 },
      {
        data: [crearPedido({ id: "pedido-2" })],
        error: null,
        count: 3,
      },
    ]);

    await expect(
      obtenerTendencias(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las tendencias");
  });
});
