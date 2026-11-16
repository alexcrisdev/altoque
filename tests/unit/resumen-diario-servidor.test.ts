import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../src/lib/supabase/admin", () => ({
  crearClienteAdmin: vi.fn(),
}));

import {
  crearClienteAdmin,
} from "../../src/lib/supabase/admin";
import {
  obtenerResumenDiario,
  RestauranteResumenNoEncontrado,
} from "../../src/features/dashboard/resumen-diario";

const id = "10000000-0000-0000-0000-000000000001";
const fecha = "2026-11-15";

type Respuesta = {
  data: unknown[] | null;
  count: number | null;
  error: { code: string } | null;
};

function pagina(
  data: unknown[] = [],
  count = data.length,
): Respuesta {
  return { data, count, error: null };
}

function filaPago(cambios = {}) {
  return {
    id: "p1",
    restaurant_id: id,
    table_session_id: null,
    order_id: "o1",
    method: "CARD",
    status: "CONFIRMED",
    amount: "12.50",
    confirmed_at: "2026-11-15T17:00:00Z",
    stripe_session_id: "cs_prueba",
    ...cambios,
  };
}

function filaPrediccion(cambios = {}) {
  return {
    id: "f1",
    restaurant_id: id,
    product_id: "pr1",
    forecast_date: "2026-11-16",
    predicted_quantity: 46,
    model: "modelo-v1",
    created_at: "2026-11-15T17:00:00Z",
    producto: { name: "Ceviche" },
    ...cambios,
  };
}

function simular(
  paginas: Partial<Record<string, Respuesta[]>> = {},
) {
  const tablas = Object.fromEntries(
    [
      "payments",
      "orders",
      "account_closures",
      "demand_forecasts",
    ].map(tabla => {
      const consulta = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        overrideTypes: vi.fn(),
      };

      for (
        const respuesta of paginas[tabla] ?? [pagina()]
      ) {
        consulta.overrideTypes.mockResolvedValueOnce(
          respuesta,
        );
      }

      return [tabla, consulta];
    }),
  );

  const restaurante = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id, name: "Demo" },
      error: null,
    }),
  };

  const cliente = {
    from: vi.fn((tabla: string) =>
      tabla === "restaurants"
        ? restaurante
        : tablas[tabla],
    ),
  };

  vi.mocked(crearClienteAdmin).mockReturnValue(
    cliente as unknown as ReturnType<
      typeof crearClienteAdmin
    >,
  );

  return { tablas, restaurante, cliente };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("US-089: consulta del resumen diario", () => {
  it("filtra por restaurante y usa las fechas correspondientes", async () => {
    const { tablas, restaurante } = simular({
      payments: [pagina([filaPago()])],
      demand_forecasts: [pagina([filaPrediccion()])],
    });

    const resultado = await obtenerResumenDiario(id, fecha);

    expect(resultado.total_vendido).toBe(12.5);
    expect(resultado.ventas_por_metodo.tarjeta_en_linea)
      .toBe(12.5);

    expect(resultado.manana_prepara[0]).toMatchObject({
      nombre: "Ceviche",
      cantidad: 46,
      dia: "lunes",
    });

    expect(restaurante.eq)
      .toHaveBeenCalledWith("id", id);

    for (const consulta of Object.values(tablas)) {
      expect(consulta.eq)
        .toHaveBeenCalledWith("restaurant_id", id);
    }

    for (const [tabla, campo] of [
      ["payments", "confirmed_at"],
      ["orders", "created_at"],
      ["account_closures", "closed_at"],
    ]) {
      expect(tablas[tabla].gte).toHaveBeenCalledWith(
        campo,
        "2026-11-15T05:00:00.000Z",
      );

      expect(tablas[tabla].lt).toHaveBeenCalledWith(
        campo,
        "2026-11-16T05:00:00.000Z",
      );
    }

    expect(tablas.payments.eq)
      .toHaveBeenCalledWith("status", "CONFIRMED");

    expect(tablas.orders.neq)
      .toHaveBeenCalledWith("status", "CANCELLED");

    expect(tablas.account_closures.eq)
      .toHaveBeenCalledWith("kind", "EXCEPTION");

    expect(tablas.demand_forecasts.eq)
      .toHaveBeenCalledWith(
        "forecast_date",
        "2026-11-16",
      );

    const columnas = JSON.stringify(
      Object.values(tablas).flatMap(
        consulta => consulta.select.mock.calls,
      ),
    );

    expect(columnas).not.toMatch(
      /customer_name|customer_phone|receipt_email/,
    );
  });

  it("un día vacío conserva el restaurante y devuelve cero", async () => {
    simular();

    const resultado = await obtenerResumenDiario(id, fecha);

    expect(resultado.total_vendido).toBe(0);
    expect(resultado.pedidos).toBe(0);
    expect(resultado.manana_prepara).toEqual([]);
  });

  it("continúa páginas cortas hasta completar el conteo", async () => {
    const { tablas } = simular({
      payments: [
        pagina([filaPago()], 2),
        pagina([filaPago({ id: "p2" })], 2),
      ],
    });

    expect(
      (await obtenerResumenDiario(id, fecha)).total_vendido,
    ).toBe(25);

    expect(tablas.payments.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
    ]);
  });

  it("rechaza conteos que cambian entre páginas", async () => {
    simular({
      payments: [
        pagina([filaPago()], 2),
        pagina([filaPago({ id: "p2" })], 3),
      ],
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow("cambió");
  });

  it.each([
    { data: null, count: 0, error: null },
    { data: [], count: null, error: null },
    { data: [], count: -1, error: null },
    { data: [], count: 1, error: null },
  ])("rechaza una lectura incompleta: %j", async respuesta => {
    simular({ payments: [respuesta] });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow();
  });

  it("rechaza registros repetidos", async () => {
    simular({
      payments: [pagina([filaPago(), filaPago()])],
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow("inconsistentes");
  });

  it("rechaza registros de otro restaurante", async () => {
    simular({
      payments: [
        pagina([filaPago({ restaurant_id: "otro" })]),
      ],
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow("inconsistentes");
  });

  it.each([
    "payments",
    "orders",
    "account_closures",
    "demand_forecasts",
  ])("no oculta errores de %s", async tabla => {
    simular({
      [tabla]: [{
        data: null,
        count: null,
        error: { code: "42501" },
      }],
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow("consultar");
  });

  it.each([
    "42P01",
    "PGRST205",
  ])("si US-090 falta (%s), omite la predicción", async code => {
    simular({
      demand_forecasts: [{
        data: null,
        count: null,
        error: { code },
      }],
    });

    expect(
      (await obtenerResumenDiario(id, fecha)).manana_prepara,
    ).toEqual([]);

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    { producto: null },
    { forecast_date: "2026-11-17" },
  ])("rechaza una predicción inconsistente: %j", async cambios => {
    simular({
      demand_forecasts: [
        pagina([filaPrediccion(cambios)]),
      ],
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toThrow("predicción");
  });

  it("distingue restaurante inexistente de un día sin ventas", async () => {
    const { restaurante, cliente } = simular();

    restaurante.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(obtenerResumenDiario(id, fecha))
      .rejects.toBeInstanceOf(
        RestauranteResumenNoEncontrado,
      );

    expect(cliente.from)
      .toHaveBeenCalledExactlyOnceWith("restaurants");
  });

  it.each([
    ["invalido", fecha],
    [id, "2026-11-31"],
    [id, "9999-12-31"],
  ])("valida antes de crear el cliente: %s %s", async (
    restaurante,
    dia,
  ) => {
    await expect(obtenerResumenDiario(restaurante, dia))
      .rejects.toThrow();

    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
});
