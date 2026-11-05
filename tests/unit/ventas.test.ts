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
import { obtenerResumenVentas } from "../../src/features/dashboard/ventas";
import {
  calcularResumenVentas,
  rangoLimaAUtc,
  validarRango,
  type PagoVenta,
} from "../../src/features/dashboard/ventas-logica";

function crearPago(
  cambios: Partial<PagoVenta> = {},
): PagoVenta {
  return {
    table_session_id: "mesa-1",
    order_id: null,
    method: "CASH",
    status: "CONFIRMED",
    amount: "10.00",
    ...cambios,
  };
}

type RespuestaVentas = {
  data: PagoVenta[] | null;
  error: { code: string } | null;
  count: number | null;
};

function simularVentas(respuestas: RespuestaVentas[]) {
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

describe("resumen de ventas US-018", () => {
  it("solo cuenta pagos confirmados", () => {
    const resultado = calcularResumenVentas([
      crearPago(),
      crearPago({
        table_session_id: "mesa-2",
        status: "PENDING",
        amount: "50.00",
      }),
      crearPago({
        table_session_id: "mesa-3",
        status: "FAILED",
        amount: "70.00",
      }),
    ]);

    expect(resultado).toEqual({
      ventasCentimos: 1000,
      cuentasPagadas: 1,
      ticketPromedioCentimos: 1000,
      porMetodo: { CASH: 1000, YAPE: 0, CARD: 0 },
    });
  });

  it("dos pagos de una mesa cuentan como una sola cuenta", () => {
    const resultado = calcularResumenVentas([
      crearPago({ amount: "12.50" }),
      crearPago({ method: "YAPE", amount: "7.50" }),
    ]);

    expect(resultado).toEqual({
      ventasCentimos: 2000,
      cuentasPagadas: 1,
      ticketPromedioCentimos: 2000,
      porMetodo: { CASH: 1250, YAPE: 750, CARD: 0 },
    });
  });

  it("combina cuentas de mesa y pedidos para llevar", () => {
    const resultado = calcularResumenVentas([
      crearPago({ amount: 20 }),
      crearPago({
        table_session_id: null,
        order_id: "pedido-1",
        method: "CARD",
        amount: 30,
      }),
    ]);

    expect(resultado).toEqual({
      ventasCentimos: 5000,
      cuentasPagadas: 2,
      ticketPromedioCentimos: 2500,
      porMetodo: { CASH: 2000, YAPE: 0, CARD: 3000 },
    });
  });

  it("varios pagos de un pedido para llevar cuentan una sola cuenta", () => {
    const cuenta = {
      table_session_id: null,
      order_id: "pedido-1",
    };

    const resultado = calcularResumenVentas([
      crearPago({ ...cuenta, amount: 5 }),
      crearPago({ ...cuenta, method: "YAPE", amount: 10 }),
    ]);

    expect(resultado.cuentasPagadas).toBe(1);
    expect(resultado.ventasCentimos).toBe(1500);
  });

  it("distingue mesa y pedido aunque coincidan sus identificadores", () => {
    const resultado = calcularResumenVentas([
      crearPago({ table_session_id: "mismo-id" }),
      crearPago({
        table_session_id: null,
        order_id: "mismo-id",
      }),
    ]);

    expect(resultado.cuentasPagadas).toBe(2);
  });

  it("sin pagos devuelve todos los indicadores en cero", () => {
    expect(calcularResumenVentas([])).toEqual({
      ventasCentimos: 0,
      cuentasPagadas: 0,
      ticketPromedioCentimos: 0,
      porMetodo: { CASH: 0, YAPE: 0, CARD: 0 },
    });
  });

  it("sin pagos confirmados devuelve cero", () => {
    const resultado = calcularResumenVentas([
      crearPago({ status: "PENDING" }),
      crearPago({ status: "FAILED" }),
    ]);

    expect(resultado.ventasCentimos).toBe(0);
    expect(resultado.cuentasPagadas).toBe(0);
    expect(resultado.ticketPromedioCentimos).toBe(0);
  });

  it("redondea S/ 10.00 entre tres cuentas a S/ 3.33", () => {
    const resultado = calcularResumenVentas([
      crearPago({ table_session_id: "mesa-1", amount: "3.00" }),
      crearPago({ table_session_id: "mesa-2", amount: "3.00" }),
      crearPago({ table_session_id: "mesa-3", amount: "4.00" }),
    ]);

    expect(resultado.ventasCentimos).toBe(1000);
    expect(resultado.cuentasPagadas).toBe(3);
    expect(resultado.ticketPromedioCentimos).toBe(333);
  });

  it("suma importes decimales usando céntimos", () => {
    const resultado = calcularResumenVentas([
      crearPago({ amount: "0.10" }),
      crearPago({ amount: "0.20" }),
    ]);

    expect(resultado.ventasCentimos).toBe(30);
  });

  it.each([0, -1, NaN, Infinity, "importe inválido"])(
    "rechaza el monto confirmado inválido %s",
    (amount) => {
      expect(() =>
        calcularResumenVentas([crearPago({ amount })]),
      ).toThrow("monto inválido");
    },
  );

  it("rechaza pagos confirmados sin cuenta", () => {
    expect(() =>
      calcularResumenVentas([
        crearPago({ table_session_id: null, order_id: null }),
      ]),
    ).toThrow("cuenta inválida");
  });

  it("rechaza pagos confirmados asociados a dos cuentas", () => {
    expect(() =>
      calcularResumenVentas([
        crearPago({ order_id: "pedido-1" }),
      ]),
    ).toThrow("cuenta inválida");
  });

  it("no modifica los pagos recibidos", () => {
    const pago = Object.freeze(crearPago());
    const pagos = Object.freeze([pago]);

    calcularResumenVentas(pagos);

    expect(pagos).toEqual([crearPago()]);
  });
});

describe("rango de fechas US-018", () => {
  it("permite consultar un mismo día", () => {
    expect(validarRango("2026-11-02", "2026-11-02")).toBeNull();
  });

  it("rechaza Desde posterior a Hasta", () => {
    expect(validarRango("2026-11-03", "2026-11-02")).toContain(
      "posterior",
    );
  });

  it.each([
    "",
    "02/11/2026",
    "2026-2-01",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "0000-01-01",
  ])("rechaza la fecha inválida %s", (fecha) => {
    expect(validarRango(fecha, "2026-11-02")).not.toBeNull();
    expect(validarRango("2026-01-01", fecha)).not.toBeNull();
  });

  it("valida los días de febrero en años bisiestos", () => {
    expect(validarRango("2028-02-29", "2028-02-29")).toBeNull();
    expect(validarRango("2026-02-29", "2026-03-01")).not.toBeNull();
  });

  it("convierte un día de Lima a límites UTC", () => {
    expect(rangoLimaAUtc("2026-11-02", "2026-11-02")).toEqual({
      desdeUtc: "2026-11-02T05:00:00.000Z",
      hastaUtcExclusivo: "2026-11-03T05:00:00.000Z",
    });
  });

  it("resuelve el cambio de mes y año", () => {
    expect(rangoLimaAUtc("2026-12-31", "2026-12-31")).toEqual({
      desdeUtc: "2026-12-31T05:00:00.000Z",
      hastaUtcExclusivo: "2027-01-01T05:00:00.000Z",
    });
  });

  it("resuelve el día siguiente de un febrero bisiesto", () => {
    expect(rangoLimaAUtc("2028-02-29", "2028-02-29")).toEqual({
      desdeUtc: "2028-02-29T05:00:00.000Z",
      hastaUtcExclusivo: "2028-03-01T05:00:00.000Z",
    });
  });

  it("no convierte un rango inválido", () => {
    expect(() =>
      rangoLimaAUtc("2026-11-03", "2026-11-02"),
    ).toThrow("posterior");
  });
});

describe("consulta de ventas US-018", () => {
  const restauranteId = "restaurante-autorizado";
  const desde = "2026-11-02";
  const hasta = "2026-11-02";

  it("filtra por restaurante, estado y fecha de confirmación", async () => {
    const { cliente, consulta } = simularVentas([
      { data: [crearPago()], error: null, count: 1 },
    ]);

    const resultado = await obtenerResumenVentas(
      restauranteId,
      desde,
      hasta,
    );

    expect(resultado.ventasCentimos).toBe(1000);

    expect(cliente.from).toHaveBeenCalledExactlyOnceWith(
      "payments",
    );

    expect(consulta.select).toHaveBeenCalledExactlyOnceWith(
      "table_session_id, order_id, method, status, amount",
      { count: "exact" },
    );

    expect(consulta.eq).toHaveBeenCalledWith(
      "restaurant_id",
      restauranteId,
    );
    expect(consulta.eq).toHaveBeenCalledWith(
      "status",
      "CONFIRMED",
    );
    expect(consulta.eq).toHaveBeenCalledTimes(2);

    expect(consulta.gte).toHaveBeenCalledWith(
      "confirmed_at",
      "2026-11-02T05:00:00.000Z",
    );
    expect(consulta.lt).toHaveBeenCalledWith(
      "confirmed_at",
      "2026-11-03T05:00:00.000Z",
    );

    expect(consulta.order).toHaveBeenCalledWith(
      "id",
      { ascending: true },
    );
    expect(consulta.range).toHaveBeenCalledWith(0, 499);
  });

  it("no consulta un rango invertido", async () => {
    await expect(
      obtenerResumenVentas(
        restauranteId,
        "2026-11-03",
        "2026-11-02",
      ),
    ).rejects.toThrow("posterior");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("no consulta sin restaurante", async () => {
    await expect(
      obtenerResumenVentas("", desde, hasta),
    ).rejects.toThrow("identificar el restaurante");

    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("sin pagos devuelve cero", async () => {
    simularVentas([
      { data: [], error: null, count: 0 },
    ]);

    expect(
      await obtenerResumenVentas(restauranteId, desde, hasta),
    ).toEqual(calcularResumenVentas([]));
  });

  it("recorre páginas y no duplica las cuentas compartidas", async () => {
    const { consulta } = simularVentas([
      {
        data: [crearPago({ amount: 10 })],
        error: null,
        count: 2,
      },
      {
        data: [crearPago({ method: "YAPE", amount: 5 })],
        error: null,
        count: 2,
      },
    ]);

    const resultado = await obtenerResumenVentas(
      restauranteId,
      desde,
      hasta,
    );

    expect(resultado.ventasCentimos).toBe(1500);
    expect(resultado.cuentasPagadas).toBe(1);

    expect(consulta.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
    ]);
  });

  it("lanza error de consulta en lugar de mostrar ventas cero", async () => {
    const registro = vi.spyOn(console, "error")
      .mockImplementation(() => {});

    simularVentas([
      { data: null, error: { code: "XX001" }, count: null },
    ]);

    await expect(
      obtenerResumenVentas(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las ventas");

    expect(registro).toHaveBeenCalledExactlyOnceWith(
      "obtenerResumenVentas",
      "XX001",
    );
  });

  it("no devuelve un reporte parcial si falla otra página", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    simularVentas([
      { data: [crearPago()], error: null, count: 2 },
      { data: null, error: { code: "XX002" }, count: null },
    ]);

    await expect(
      obtenerResumenVentas(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las ventas");
  });

  it("rechaza resultados incompletos", async () => {
    simularVentas([
      { data: [], error: null, count: 1 },
    ]);

    await expect(
      obtenerResumenVentas(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las ventas");
  });

  it("pide repetir si cambia la cantidad de pagos entre páginas", async () => {
    simularVentas([
      { data: [crearPago()], error: null, count: 2 },
      { data: [crearPago()], error: null, count: 3 },
    ]);

    await expect(
      obtenerResumenVentas(restauranteId, desde, hasta),
    ).rejects.toThrow("No se pudieron consultar las ventas");
  });
});
