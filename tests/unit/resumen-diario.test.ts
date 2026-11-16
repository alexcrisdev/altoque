import { describe, expect, it } from "vitest";
import {
  calcularResumenDiario,
  fechaSiguienteResumen,
  type DatosResumenDiario,
  type PagoResumenDiario,
  type CierreResumenDiario,
} from "../../src/features/dashboard/resumen-diario-logica";
import {
  calcularProductosMasVendidos,
  type PedidoTendencia,
} from "../../src/features/dashboard/tendencias-logica";
import type {
  PrediccionPlato,
} from "../../src/features/dashboard/prediccion-logica";

const fecha = "2026-11-15";
const instante = "2026-11-15T17:00:00Z";
const restaurante = {
  id: "10000000-0000-0000-0000-000000000001",
  nombre: "Cevichería Demo",
};

function datos(
  cambios: Partial<DatosResumenDiario> = {},
): DatosResumenDiario {
  return {
    restaurante,
    fecha,
    pagos: [],
    pedidos: [],
    cierres: [],
    predicciones: [],
    ...cambios,
  };
}

function pago(
  id: string,
  cambios: Partial<PagoResumenDiario> = {},
): PagoResumenDiario {
  return {
    id,
    order_id: "pedido-1",
    table_session_id: null,
    method: "CASH",
    status: "CONFIRMED",
    amount: "10.00",
    confirmed_at: instante,
    stripe_session_id: null,
    ...cambios,
  };
}

function pedido(
  id: string,
  nombre = "Ceviche clásico",
  cantidad = 1,
  cambios: Partial<PedidoTendencia> = {},
): PedidoTendencia {
  return {
    id,
    created_at: instante,
    status: "IN_PROGRESS",
    order_items: [{
      product_id: id,
      product_name: nombre,
      quantity: cantidad,
    }],
    ...cambios,
  };
}

function cierre(
  id: string,
  cambios: Partial<CierreResumenDiario> = {},
): CierreResumenDiario {
  return {
    id,
    kind: "EXCEPTION",
    reason: "Consumo de cortesía autorizado",
    closed_at: instante,
    ...cambios,
  };
}

function prediccion(
  productoId: string,
  cantidadPrevista: number,
  cambios: Partial<PrediccionPlato> = {},
): PrediccionPlato {
  return {
    productoId,
    nombre: productoId,
    cantidadPrevista,
    fecha: "2026-11-16",
    modelo: "modelo-v1",
    creadoEn: instante,
    ...cambios,
  };
}

describe("US-089: resumen diario", () => {
  it("un día vacío devuelve importes cero y listas vacías", () => {
    expect(calcularResumenDiario(datos())).toEqual({
      restaurante,
      fecha,
      total_vendido: 0,
      pedidos: 0,
      ventas_por_metodo: {
        efectivo: 0,
        yape: 0,
        tarjeta_caja: 0,
        tarjeta_en_linea: 0,
      },
      plato_mas_vendido: null,
      cierres_con_excepcion: {
        cantidad: 0,
        motivos: [],
      },
      manana_prepara: [],
    });
  });

  it("separa los cuatro medios y suma dinero en céntimos", () => {
    const resultado = calcularResumenDiario(datos({
      pagos: [
        pago("cash", { amount: "10.10" }),
        pago("yape", {
          method: "YAPE",
          amount: "20.20",
        }),
        pago("card", {
          method: "CARD",
          amount: "30.30",
        }),
        pago("stripe", {
          method: "CARD",
          stripe_session_id: "cs_local",
          amount: "40.40",
        }),
      ],
    }));

    expect(resultado.total_vendido).toBe(101);
    expect(resultado.ventas_por_metodo).toEqual({
      efectivo: 10.1,
      yape: 20.2,
      tarjeta_caja: 30.3,
      tarjeta_en_linea: 40.4,
    });
  });

  it("no incluye pagos pendientes ni fallidos", () => {
    const resultado = calcularResumenDiario(datos({
      pagos: [
        pago("a", { status: "PENDING" }),
        pago("b", { status: "FAILED" }),
        pago("c", {
          status: "PENDING",
          confirmed_at: null,
        }),
      ],
    }));

    expect(resultado.total_vendido).toBe(0);
  });

  it("atribuye el pago a su confirmación y el pedido a su creación", () => {
    const resultado = calcularResumenDiario(datos({
      pagos: [pago("p")],
      pedidos: [
        pedido("anterior", "Ceviche", 1, {
          created_at: "2026-11-14T17:00:00Z",
        }),
      ],
    }));

    expect(resultado.total_vendido).toBe(10);
    expect(resultado.pedidos).toBe(0);
  });

  it.each([
    ["2026-11-15T04:59:59.999Z", false],
    ["2026-11-15T05:00:00.000Z", true],
    ["2026-11-16T04:59:59.999Z", true],
    ["2026-11-16T05:00:00.000Z", false],
    ["2026-11-15T00:00:00-05:00", true],
  ])("usa el día completo en Lima: %s", (hora, incluido) => {
    const resultado = calcularResumenDiario(datos({
      pagos: [pago("p", { confirmed_at: hora })],
      pedidos: [
        pedido("o", "Ceviche", 1, {
          created_at: hora,
        }),
      ],
      cierres: [cierre("c", { closed_at: hora })],
    }));

    expect(resultado.total_vendido).toBe(incluido ? 10 : 0);
    expect(resultado.pedidos).toBe(incluido ? 1 : 0);
    expect(resultado.cierres_con_excepcion.cantidad)
      .toBe(incluido ? 1 : 0);
  });

  it("excluye cancelados del conteo y del plato más vendido", () => {
    const resultado = calcularResumenDiario(datos({
      pedidos: [
        pedido("a", "Ceviche", 2),
        pedido("b", "Otro plato", 100, {
          status: "CANCELLED",
        }),
      ],
    }));

    expect(resultado.pedidos).toBe(1);
    expect(resultado.plato_mas_vendido).toEqual({
      nombre: "Ceviche",
      cantidad: 2,
    });
  });

  it("cuenta cada pedido una vez aunque tenga varias líneas", () => {
    const actual = pedido("a", "Ceviche", 4);

    actual.order_items.push({
      product_id: "otro",
      product_name: "Leche de tigre",
      quantity: 3,
    });

    expect(
      calcularResumenDiario(datos({ pedidos: [actual] })).pedidos,
    ).toBe(1);
  });

  it("agrupa nombres iguales con identificadores diferentes", () => {
    const resultado = calcularResumenDiario(datos({
      pedidos: [
        pedido("a", "Ceviche", 3),
        pedido("b", "Ceviche", 4),
        pedido("c", "Leche de tigre", 6),
      ],
    }));

    expect(resultado.plato_mas_vendido).toEqual({
      nombre: "Ceviche",
      cantidad: 7,
    });
  });

  it("separa los nombres históricos de un producto renombrado", () => {
    const primero = pedido("a", "Nombre anterior", 2);
    const segundo = pedido("b", "Nombre nuevo", 3);

    segundo.order_items[0].product_id =
      primero.order_items[0].product_id;

    const resultado = calcularResumenDiario(datos({
      pedidos: [primero, segundo],
    }));

    expect(resultado.plato_mas_vendido).toEqual({
      nombre: "Nombre nuevo",
      cantidad: 3,
    });
  });

  it("resuelve empates alfabéticamente", () => {
    const resultado = calcularResumenDiario(datos({
      pedidos: [
        pedido("a", "Leche de tigre", 2),
        pedido("b", "Ceviche", 2),
      ],
    }));

    expect(resultado.plato_mas_vendido?.nombre).toBe("Ceviche");
  });

  it("conserva la agrupación por ID predeterminada del dashboard", () => {
    const resultado = calcularProductosMasVendidos([
      pedido("a", "Ceviche", 3),
      pedido("b", "Ceviche", 4),
    ]);

    expect(resultado).toHaveLength(2);
  });

  it("incluye solo cierres con excepción y sus motivos", () => {
    const resultado = calcularResumenDiario(datos({
      cierres: [
        cierre("a"),
        cierre("b", {
          reason: "Diferencia autorizada por el dueño",
        }),
        cierre("c", {
          kind: "ORDINARY",
          reason: null,
        }),
      ],
    }));

    expect(resultado.cierres_con_excepcion).toEqual({
      cantidad: 2,
      motivos: [
        "Consumo de cortesía autorizado",
        "Diferencia autorizada por el dueño",
      ],
    });
  });

  it("selecciona el top 3 del día siguiente a la fecha consultada", () => {
    const resultado = calcularResumenDiario(datos({
      predicciones: [
        prediccion("a", 10),
        prediccion("b", 46),
        prediccion("c", 38),
        prediccion("d", 25),
        prediccion("otro-dia", 500, { fecha }),
      ],
    }));

    expect(
      resultado.manana_prepara.map(plato => [
        plato.nombre,
        plato.cantidad,
        plato.dia,
      ]),
    ).toEqual([
      ["b", 46, "lunes"],
      ["c", 38, "lunes"],
      ["d", 25, "lunes"],
    ]);

    expect(
      resultado.manana_prepara.every(
        plato => plato.fecha === "2026-11-16",
      ),
    ).toBe(true);
  });

  it("sin predicciones de mañana devuelve una lista vacía", () => {
    const resultado = calcularResumenDiario(datos({
      predicciones: [prediccion("a", 46, { fecha })],
    }));

    expect(resultado.manana_prepara).toEqual([]);
  });

  it("prefiere el modelo real frente a demo sin sumarlos", () => {
    const resultado = calcularResumenDiario(datos({
      predicciones: [
        prediccion("a", 46),
        prediccion("a", 99, {
          modelo: "otro-demo",
          creadoEn: "2026-11-16T01:00:00Z",
        }),
      ],
    }));

    expect(resultado.manana_prepara[0].cantidad).toBe(46);
  });

  it("redondea la predicción al entero más cercano", () => {
    const resultado = calcularResumenDiario(datos({
      predicciones: [prediccion("a", 46.5)],
    }));

    expect(resultado.manana_prepara[0].cantidad).toBe(47);
  });

  it.each([
    ["2026-11-30", "2026-12-01"],
    ["2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29"],
  ])("resuelve el día siguiente de %s", (actual, siguiente) => {
    expect(fechaSiguienteResumen(actual)).toBe(siguiente);
  });

  it.each([
    "2026-11-31",
    "2026-1-01",
    "0000-01-01",
    "invalida",
  ])("rechaza fecha de consulta inválida %s", (invalida) => {
    expect(() =>
      calcularResumenDiario(datos({ fecha: invalida })),
    ).toThrow();
  });

  it.each([
    "2026-11-15T12:00:00",
    "2026-11-31T12:00:00Z",
    "invalida",
  ])("rechaza fecha de registro inválida %s", (hora) => {
    expect(() =>
      calcularResumenDiario(datos({
        pagos: [pago("a", { confirmed_at: hora })],
      })),
    ).toThrow();
  });

  it.each([
    "pagos",
    "pedidos",
    "cierres",
  ] as const)("rechaza identificadores duplicados en %s", (campo) => {
    const actual = datos();

    if (campo === "pagos") {
      actual.pagos = [pago("a"), pago("a")];
    }

    if (campo === "pedidos") {
      actual.pedidos = [pedido("a"), pedido("a")];
    }

    if (campo === "cierres") {
      actual.cierres = [cierre("a"), cierre("a")];
    }

    expect(() => calcularResumenDiario(actual))
      .toThrow("duplicados");
  });

  it("rechaza Stripe asociado a un medio distinto de tarjeta", () => {
    expect(() =>
      calcularResumenDiario(datos({
        pagos: [
          pago("a", { stripe_session_id: "cs_local" }),
        ],
      })),
    ).toThrow("canal");
  });

  it("rechaza un pago confirmado sin fecha", () => {
    expect(() =>
      calcularResumenDiario(datos({
        pagos: [pago("a", { confirmed_at: null })],
      })),
    ).toThrow();
  });

  it("rechaza cierres con excepción sin motivo", () => {
    expect(() =>
      calcularResumenDiario(datos({
        cierres: [cierre("a", { reason: null })],
      })),
    ).toThrow("motivo");
  });

  it("no modifica datos ni publica campos adicionales de clientes", () => {
    const actual = datos({
      pagos: [pago("a")],
      pedidos: [pedido("o")],
      predicciones: [prediccion("p", 46)],
    });

    const antes = structuredClone(actual);

    const conCliente = {
      ...actual,
      customer_name: "Nombre privado",
      customer_phone: "999999999",
    };

    const resultado = calcularResumenDiario(conCliente);

    expect(actual).toEqual(antes);
    expect(JSON.stringify(resultado))
      .not.toContain("Nombre privado");
    expect(JSON.stringify(resultado))
      .not.toContain("999999999");
  });
});
