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
import { obtenerMapaCalor } from "../../src/features/dashboard/mapa-calor";
import type { FiltroMapa } from "../../src/features/dashboard/mapa-calor-logica";

const restauranteId = "restaurante-autorizado";

const filtro: FiltroMapa = {
  desde: "2026-11-02",
  hasta: "2026-11-15",
  horaDesde: 11,
  horaHasta: 13,
  diasAbiertos: [0, 1, 2, 3, 4, 5, 6],
};

function crearPedido() {
  return {
    id: "pedido-1",
    status: "DELIVERED",
    created_at: "2026-11-02T16:30:00Z",
    order_items: [
      { product_id: "ceviche", product_name: "Ceviche" },
    ],
  };
}

type Fila = ReturnType<typeof crearPedido>;

type Respuesta = {
  data: Fila[] | null;
  count: number | null;
  error: { code: string } | null;
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

  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);

  return { cliente, consulta };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consulta del mapa de calor US-084", () => {
  it("consulta solo los campos necesarios y filtra por restaurante y fechas", async () => {
    const { cliente, consulta } = simularConsulta([
      { data: [crearPedido()], count: 1, error: null },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, filtro);

    expect(resultado.totalPedidos).toBe(1);
    expect(resultado.productos).toEqual([
      { id: "ceviche", nombre: "Ceviche" },
    ]);

    expect(cliente.from).toHaveBeenCalledExactlyOnceWith("orders");
    expect(consulta.select).toHaveBeenCalledExactlyOnceWith(
      "id, status, created_at, order_items(product_id, product_name)",
      { count: "exact" },
    );
    expect(consulta.eq).toHaveBeenCalledExactlyOnceWith(
      "restaurant_id",
      restauranteId,
    );
    expect(consulta.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-11-02T05:00:00.000Z",
    );
    expect(consulta.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-11-16T05:00:00.000Z",
    );
    expect(consulta.order).toHaveBeenCalledWith(
      "id",
      { ascending: true },
    );
    expect(consulta.range).toHaveBeenCalledWith(0, 499);
  });

  it("excluye cancelados del mapa y del selector de platos", async () => {
    simularConsulta([
      {
        data: [{
          ...crearPedido(),
          status: "CANCELLED",
        }],
        count: 1,
        error: null,
      },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, filtro);

    expect(resultado.totalPedidos).toBe(0);
    expect(resultado.productos).toEqual([]);
    expect(resultado.sugerencias).toEqual([]);
  });

  it("filtra el mapa por plato y conserva las opciones del periodo", async () => {
    simularConsulta([
      {
        data: [
          crearPedido(),
          {
            ...crearPedido(),
            id: "pedido-2",
            order_items: [
              { product_id: "pota", product_name: "Pota" },
            ],
          },
        ],
        count: 2,
        error: null,
      },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, {
      ...filtro,
      productoId: "ceviche",
    });

    expect(resultado.totalPedidos).toBe(1);
    expect(resultado.productos).toEqual([
      { id: "ceviche", nombre: "Ceviche" },
      { id: "pota", nombre: "Pota" },
    ]);
  });

  it("sin pedidos devuelve el mapa en cero y sin promociones", async () => {
    simularConsulta([
      { data: [], count: 0, error: null },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, filtro);

    expect(resultado.totalPedidos).toBe(0);
    expect(resultado.celdas).toHaveLength(14);
    expect(resultado.celdas.every((celda) => celda.pedidos === 0)).toBe(true);
    expect(resultado.productos).toEqual([]);
    expect(resultado.sugerencias).toEqual([]);
  });

  it("no consulta un rango inválido", async () => {
    await expect(obtenerMapaCalor(restauranteId, {
      ...filtro,
      desde: "2026-11-16",
    })).rejects.toThrow("posterior");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("no consulta sin restaurante", async () => {
    await expect(
      obtenerMapaCalor(" ", filtro),
    ).rejects.toThrow("identificar el restaurante");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("recorre páginas y conserva el nombre más reciente del plato", async () => {
    const { consulta } = simularConsulta([
      { data: [crearPedido()], count: 2, error: null },
      {
        data: [{
          ...crearPedido(),
          id: "pedido-2",
          created_at: "2026-11-09T16:30:00Z",
          order_items: [
            { product_id: "ceviche", product_name: "Ceviche clásico" },
          ],
        }],
        count: 2,
        error: null,
      },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, filtro);

    expect(resultado.totalPedidos).toBe(2);
    expect(resultado.productos).toEqual([
      { id: "ceviche", nombre: "Ceviche clásico" },
    ]);
    expect(consulta.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
    ]);
  });

  it("reinicia la lectura y descarta los datos del intento interrumpido", async () => {
    const definitivo = {
      ...crearPedido(),
      id: "pedido-definitivo",
      order_items: [
        { product_id: "pota", product_name: "Pota" },
      ],
    };

    const { consulta } = simularConsulta([
      { data: [crearPedido()], count: 2, error: null },
      { data: [], count: 3, error: null },
      { data: [definitivo], count: 1, error: null },
    ]);

    const resultado = await obtenerMapaCalor(restauranteId, filtro);

    expect(resultado.totalPedidos).toBe(1);
    expect(resultado.productos).toEqual([
      { id: "pota", nombre: "Pota" },
    ]);
    expect(consulta.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
      [0, 499],
    ]);
  });

  it("limita los intentos cuando el conteo sigue cambiando", async () => {
    const { consulta } = simularConsulta([
      { data: [crearPedido()], count: 2, error: null },
      { data: [], count: 3, error: null },
      { data: [crearPedido()], count: 3, error: null },
      { data: [], count: 4, error: null },
    ]);

    await expect(
      obtenerMapaCalor(restauranteId, filtro),
    ).rejects.toThrow("No se pudo consultar el mapa de calor");

    expect(consulta.overrideTypes).toHaveBeenCalledTimes(4);
  });

  it("no presenta resultados parciales cuando falla otra página", async () => {
    simularConsulta([
      { data: [crearPedido()], count: 2, error: null },
      { data: null, count: null, error: { code: "XX001" } },
    ]);

    await expect(
      obtenerMapaCalor(restauranteId, filtro),
    ).rejects.toThrow("No se pudo consultar el mapa de calor");

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "obtenerMapaCalor",
      "XX001",
    );
  });

  it("rechaza una consulta incompleta", async () => {
    simularConsulta([
      { data: [], count: 1, error: null },
    ]);

    await expect(
      obtenerMapaCalor(restauranteId, filtro),
    ).rejects.toThrow("No se pudo consultar el mapa de calor");
  });

  it("rechaza pedidos repetidos entre páginas", async () => {
    simularConsulta([
      { data: [crearPedido()], count: 2, error: null },
      { data: [crearPedido()], count: 2, error: null },
    ]);

    await expect(
      obtenerMapaCalor(restauranteId, filtro),
    ).rejects.toThrow("No se pudo consultar el mapa de calor");
  });
});