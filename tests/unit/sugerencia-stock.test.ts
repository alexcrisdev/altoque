import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));

import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import { crearClienteServidor } from "../../src/lib/supabase/server";
import {
  calcularSugerenciaPlato,
  MODELO_SUGERENCIA_STOCK,
  momentoQuiebre,
  sumarDias,
  type DiaVenta,
} from "../../src/features/dashboard/sugerencia-stock-logica";
import { seleccionarPrediccionPorPlato, type PrediccionPlato } from "../../src/features/dashboard/prediccion-logica";
import { crearSugerenciasStock } from "../../src/features/carta/rellenar-stock-logica";
import { ejecutarSugerenciaStock } from "../../src/features/dashboard/sugerencia-stock";
import { obtenerPrediccionManana } from "../../src/features/dashboard/prediccion";
import { obtenerAgotadosRecientes } from "../../src/features/dashboard/agotados";
import { config } from "../../src/proxy";

// Jueves 26/11/2026 en Lima. Mismo día de la semana: 19/11 (1 semana), 12/11, 05/11 y 29/10 (4).
const HOY = "2026-11-26";
const SECRETO = "s".repeat(40);

function dia(fecha: string, unidades: number, motivo: DiaVenta["motivo"] = null): DiaVenta {
  return { fecha, unidades, motivo };
}

describe("US-146: cálculo de la sugerencia", () => {
  it("historia completa: promedio ponderado del mismo día, más peso a lo reciente (4-3-2-1)", () => {
    const historia = [dia("2026-11-19", 20), dia("2026-11-12", 10), dia("2026-11-05", 10), dia("2026-10-29", 10),
      dia("2026-11-25", 99), dia("2026-11-24", 99)]; // otros días de la semana no cuentan
    // (20·4 + 10·3 + 10·2 + 10·1) / 10 = 14
    expect(calcularSugerenciaPlato(historia, HOY, HOY)).toEqual({ cantidad: 14, metodo: "mismo_dia", dias: 4 });
  });

  it("calcula también el día siguiente con su propio día de la semana", () => {
    const historia = [dia("2026-11-20", 30), dia("2026-11-13", 30), dia("2026-11-06", 30), dia("2026-11-19", 5)];
    expect(calcularSugerenciaPlato(historia, sumarDias(HOY, 1), HOY)?.cantidad).toBe(30);
  });

  it("pocos datos: con menos de 3 días no genera sugerencia propia", () => {
    expect(calcularSugerenciaPlato([dia("2026-11-25", 10), dia("2026-11-19", 12)], HOY, HOY)).toBeNull();
  });

  it("si no alcanza el mismo día de la semana, usa los últimos días válidos", () => {
    const historia = [dia("2026-11-19", 10), dia("2026-11-25", 20), dia("2026-11-24", 20), dia("2026-11-23", 20)];
    // Recientes: 25 (7), 24 (6), 23 (5), 19 (4) → (140 + 120 + 100 + 40) / 22 = 18,18
    expect(calcularSugerenciaPlato(historia, HOY, HOY)).toEqual({ cantidad: 18, metodo: "dias_recientes", dias: 4 });
  });

  it("los días recientes son como máximo 7", () => {
    // Sin el 19/11 (mismo día de la semana): los 7 más recientes valen 10; los más antiguos, 1000.
    const historia = Array.from({ length: 10 }, (_, i) => dia(sumarDias(HOY, -(i + 1)), i < 8 ? 10 : 1000))
      .filter((fila) => fila.fecha !== "2026-11-19");
    expect(calcularSugerenciaPlato(historia, HOY, HOY)?.cantidad).toBe(10);
  });

  it("un día agotado no baja la sugerencia", () => {
    const completos = [dia("2026-11-12", 10), dia("2026-11-05", 10), dia("2026-10-29", 10)];
    // Vendió 8 porque se acabó: entra como 10 (el promedio de los completos), no como 8.
    expect(calcularSugerenciaPlato([dia("2026-11-19", 8, "AGOTADO"), ...completos], HOY, HOY)?.cantidad).toBe(10);
    // Si el día agotado vendió más que el promedio, sí sube.
    expect(calcularSugerenciaPlato([dia("2026-11-19", 30, "AGOTADO"), ...completos], HOY, HOY)?.cantidad).toBe(18);
  });

  it.each(["BLOQUEADO", "LOCAL_CERRADO"] as const)("un día %s no cuenta como demanda", (motivo) => {
    const completos = [dia("2026-11-12", 10), dia("2026-11-05", 10), dia("2026-10-29", 10)];
    expect(calcularSugerenciaPlato([dia("2026-11-19", 0, motivo), ...completos], HOY, HOY))
      .toEqual({ cantidad: 10, metodo: "mismo_dia", dias: 3 });
    // Sin ese día solo quedan 2 válidos: no hay sugerencia propia.
    expect(calcularSugerenciaPlato([dia("2026-11-19", 0, motivo), ...completos.slice(1)], HOY, HOY)).toBeNull();
  });

  it("plato nuevo sin historia: no hay sugerencia propia", () => {
    expect(calcularSugerenciaPlato([], HOY, HOY)).toBeNull();
  });

  it("nunca sugiere 0, aunque la historia sea de días sin ventas", () => {
    const historia = [dia("2026-11-19", 0), dia("2026-11-12", 0), dia("2026-11-05", 0)];
    expect(calcularSugerenciaPlato(historia, HOY, HOY)?.cantidad).toBe(1);
  });

  it("solo usa días terminados de las últimas 4 semanas", () => {
    const base = [dia("2026-11-19", 10), dia("2026-11-12", 10), dia("2026-11-05", 10)];
    const conRuido = [...base, dia(HOY, 500), dia("2026-10-28", 500), dia("2026-10-22", 500)];
    expect(calcularSugerenciaPlato(conRuido, HOY, HOY)?.cantidad).toBe(10);
  });

  it("rechaza historia inválida o fechas pasadas", () => {
    expect(() => calcularSugerenciaPlato([dia("2026-11-19", 1), dia("2026-11-19", 2)], HOY, HOY)).toThrow();
    expect(() => calcularSugerenciaPlato([dia("2026-11-19", -1)], HOY, HOY)).toThrow();
    expect(() => calcularSugerenciaPlato([], "2026-11-25", HOY)).toThrow();
    expect(() => calcularSugerenciaPlato([], "2026-02-30", HOY)).toThrow();
  });
});

describe("US-146: hora aproximada del quiebre", () => {
  it("es el pedido con el que lo reservado alcanzó el stock inicial", () => {
    const lineas = [
      { creadoEn: "2026-11-25T15:00:00Z", cantidad: 2 },
      { creadoEn: "2026-11-25T14:00:00Z", cantidad: 2 },
      { creadoEn: "2026-11-25T16:00:00Z", cantidad: 3 },
      { creadoEn: "2026-11-25T17:00:00Z", cantidad: 1 },
    ];
    expect(momentoQuiebre(lineas, 5)).toBe("2026-11-25T16:00:00Z");
  });
  it("si nunca alcanza el stock usa el último pedido; sin pedidos, null", () => {
    expect(momentoQuiebre([{ creadoEn: "2026-11-25T14:00:00Z", cantidad: 1 }], 5)).toBe("2026-11-25T14:00:00Z");
    expect(momentoQuiebre([], 5)).toBeNull();
  });
});

function prediccion(productoId: string, cantidadPrevista: number, modelo: string, creadoEn = "2026-11-26T05:30:00Z"): PrediccionPlato {
  return { productoId, nombre: `Plato ${productoId}`, fecha: HOY, cantidadPrevista, modelo, creadoEn };
}

describe("US-146: una sola selección plato por plato (stock y tarjeta)", () => {
  const filas = [
    prediccion("p1", 20, MODELO_SUGERENCIA_STOCK),
    prediccion("p1", 30, "xgboost-calendario-v1"),
    prediccion("p1", 40, "xgboost-calendario-v1-demo"),
    prediccion("p2", 15, "xgboost-calendario-v1-demo"),
    prediccion("p3", 12, "xgboost-calendario-v1", "2026-11-17T10:00:00Z"),
    prediccion("p3", 50, "xgboost-calendario-v1-demo"),
  ];

  it("prefiere la sugerencia propia, luego otro modelo real y al final la demo", () => {
    expect(seleccionarPrediccionPorPlato(filas, HOY).map((fila) => [fila.productoId, fila.modelo, fila.cantidadPrevista]))
      .toEqual([
        ["p1", MODELO_SUGERENCIA_STOCK, 20],
        ["p2", "xgboost-calendario-v1-demo", 15],
        ["p3", "xgboost-calendario-v1", 12],
      ]);
  });

  it("un plato sin datos suficientes conserva su demo, rotulada como demo", () => {
    const sugerencias = crearSugerenciasStock(filas, HOY);
    expect(sugerencias.find((fila) => fila.productoId === "p2")).toMatchObject({ cantidad: 15, modelo: "xgboost-calendario-v1-demo" });
    expect(sugerencias.find((fila) => fila.productoId === "p1")?.modelo).toBe(MODELO_SUGERENCIA_STOCK);
  });

  it("entre versiones del mismo tipo gana la más reciente", () => {
    const resultado = seleccionarPrediccionPorPlato([
      prediccion("p1", 5, "a-demo", "2026-11-10T00:00:00Z"),
      prediccion("p1", 7, "b-demo", "2026-11-12T00:00:00Z"),
    ], HOY);
    expect(resultado.map((fila) => fila.modelo)).toEqual(["b-demo"]);
  });
});

// --- Base falsa en memoria (filtros mínimos de PostgREST) ---------------------------------

type Fila = Record<string, unknown>;

function valor(fila: Fila, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((actual, parte) => (actual as Fila | null)?.[parte], fila);
}

function crearBase(tablas: Record<string, Fila[]>) {
  let siguienteId = 1000;
  const consulta = (tabla: string) => {
    const filtros: ((fila: Fila) => boolean)[] = [];
    let rango: [number, number] | null = null;
    let accion: "select" | "delete" = "select";
    const filas = () => (tablas[tabla] ??= []);
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filtros.push((f) => valor(f, c) === v), builder),
      neq: (c: string, v: unknown) => (filtros.push((f) => valor(f, c) !== v), builder),
      gt: (c: string, v: number) => (filtros.push((f) => (valor(f, c) as number) > v), builder),
      gte: (c: string, v: string) => (filtros.push((f) => String(valor(f, c)) >= v), builder),
      lte: (c: string, v: string) => (filtros.push((f) => String(valor(f, c)) <= v), builder),
      lt: (c: string, v: string) => (filtros.push((f) => String(valor(f, c)) < v), builder),
      in: (c: string, v: unknown[]) => (filtros.push((f) => v.includes(valor(f, c))), builder),
      order: () => builder,
      range: (a: number, b: number) => ((rango = [a, b]), builder),
      overrideTypes: () => builder,
      delete: () => ((accion = "delete"), builder),
      upsert: async (nuevas: Fila[], { onConflict }: { onConflict: string }) => {
        const claves = onConflict.split(",");
        for (const nueva of nuevas) {
          const existente = filas().find((f) => claves.every((c) => f[c] === nueva[c]));
          if (existente) Object.assign(existente, nueva);
          else filas().push({ id: `id-${siguienteId++}`, ...nueva });
        }
        return { error: null };
      },
      then: (resolver: (r: unknown) => unknown) => {
        const coinciden = filas().filter((f) => filtros.every((filtro) => filtro(f)));
        if (accion === "delete") {
          tablas[tabla] = filas().filter((f) => !coinciden.includes(f));
          return Promise.resolve({ error: null }).then(resolver);
        }
        const pagina = rango ? coinciden.slice(rango[0], rango[1] + 1) : coinciden;
        return Promise.resolve({ data: pagina, count: coinciden.length, error: null }).then(resolver);
      },
    };
    return builder;
  };
  return { from: vi.fn(consulta), tablas };
}

describe("US-146: generación diaria (ruta del workflow)", () => {
  // 00:30 del 26/11 en Lima: genera para el 26 y el 27.
  const ahora = Date.parse("2026-11-26T05:30:00Z");
  const R = "rest-1";

  function ventas(producto: string, fechas: string[], unidades: number, motivo: string | null = null) {
    return fechas.map((sales_date, i) => ({
      id: `${producto}-${i}`, restaurant_id: R, product_id: producto, sales_date,
      units_ordered: unidades, incomplete_reason: motivo,
    }));
  }

  function datos() {
    const ultimas28 = Array.from({ length: 28 }, (_, i) => sumarDias(HOY, -(i + 1)));
    return {
      products: [
        { id: "completo", restaurant_id: R, active: true },
        { id: "pocos", restaurant_id: R, active: true },
        { id: "nuevo", restaurant_id: R, active: true },
        { id: "inactivo", restaurant_id: R, active: false },
      ],
      daily_product_sales: [
        ...ventas("completo", ultimas28, 10),
        ...ventas("pocos", ultimas28.slice(0, 2), 50),
        ...ventas("inactivo", ultimas28, 10),
      ],
      demand_forecasts: [
        // Demo previa del plato con pocos datos: se conserva.
        { id: "demo-pocos", restaurant_id: R, product_id: "pocos", forecast_date: HOY, predicted_quantity: 33, model: "xgboost-calendario-v1-demo" },
        // Sugerencia propia vieja de un plato que ya no tiene datos suficientes: se borra.
        { id: "vieja-pocos", restaurant_id: R, product_id: "pocos", forecast_date: HOY, predicted_quantity: 9, model: MODELO_SUGERENCIA_STOCK },
      ] as Fila[],
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VENTAS_CRON_SECRET", SECRETO);
  });

  it("sin secreto responde 503 y con uno incorrecto 401, sin tocar la base", async () => {
    const base = crearBase(datos());
    vi.mocked(crearClienteAdmin).mockReturnValue(base as never);
    expect((await ejecutarSugerenciaStock("Bearer otro", ahora)).estado).toBe(401);
    vi.stubEnv("VENTAS_CRON_SECRET", "");
    expect((await ejecutarSugerenciaStock(`Bearer ${SECRETO}`, ahora)).estado).toBe(503);
    expect(base.from).not.toHaveBeenCalled();
  });

  it("guarda hoy y mañana como modelo propio, conserva la demo y repetirla no duplica", async () => {
    const base = crearBase(datos());
    vi.mocked(crearClienteAdmin).mockReturnValue(base as never);

    const primera = await ejecutarSugerenciaStock(`Bearer ${SECRETO}`, ahora);
    expect(primera).toEqual({ estado: 200, cuerpo: {
      fechas: [HOY, "2026-11-27"], modelo: MODELO_SUGERENCIA_STOCK,
      sugerencias: 2, sinDatosSuficientes: 4, eliminadas: 1,
    } });
    const fotografia = () => base.tablas.demand_forecasts
      .map((f) => [f.product_id, f.forecast_date, f.model, f.predicted_quantity])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(fotografia()).toEqual([
      ["completo", HOY, MODELO_SUGERENCIA_STOCK, 10],
      ["completo", "2026-11-27", MODELO_SUGERENCIA_STOCK, 10],
      ["pocos", HOY, "xgboost-calendario-v1-demo", 33],
    ]);

    const antes = fotografia();
    const segunda = await ejecutarSugerenciaStock(`Bearer ${SECRETO}`, ahora);
    expect(segunda.cuerpo).toMatchObject({ sugerencias: 2, eliminadas: 0 });
    expect(fotografia()).toEqual(antes);
  });

  it("solo usa días terminados: ignora ventas del día de hoy", async () => {
    const tablas = datos();
    tablas.daily_product_sales.push(...ventas("nuevo", [HOY], 500));
    const base = crearBase(tablas);
    vi.mocked(crearClienteAdmin).mockReturnValue(base as never);
    await ejecutarSugerenciaStock(`Bearer ${SECRETO}`, ahora);
    expect(base.tablas.demand_forecasts.some((f) => f.product_id === "nuevo")).toBe(false);
  });

  it("si la base falla responde 500 sin detalles internos", async () => {
    vi.mocked(crearClienteAdmin).mockReturnValue({
      from: () => { throw Object.assign(new Error("detalle interno"), { code: "XX000" }); },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resultado = await ejecutarSugerenciaStock(`Bearer ${SECRETO}`, ahora);
    expect(resultado.estado).toBe(500);
    expect(JSON.stringify(resultado.cuerpo)).not.toContain("detalle interno");
  });

  it("proxy.ts no manda /api/ventas/sugerir-stock al login", () => {
    const paneles = config.matcher.map((patron) => patron.replace("/:path*", ""));
    expect(paneles.some((prefijo) => "/api/ventas/sugerir-stock".startsWith(prefijo))).toBe(false);
  });

  it("el workflow consolida primero y luego genera, con el mismo secreto", () => {
    const yml = readFileSync(join(process.cwd(), ".github", "workflows", "ventas-diarias.yml"), "utf8");
    const consolidar = yml.indexOf("/api/ventas/consolidar");
    const sugerir = yml.indexOf("/api/ventas/sugerir-stock");
    expect(consolidar).toBeGreaterThan(0);
    expect(sugerir).toBeGreaterThan(consolidar);
    expect(yml.match(/secrets\.[A-Z_]+/g)?.every((s) => s === "secrets.VENTAS_CRON_SECRET")).toBe(true);
  });
});

describe("US-146: la tarjeta de mañana usa la misma selección", () => {
  it("mezcla la propia con la demo y marca qué platos son demo", async () => {
    const fecha = "2026-11-27";
    const filas = [
      { id: "a", product_id: "p1", forecast_date: fecha, predicted_quantity: 20, model: MODELO_SUGERENCIA_STOCK, created_at: "2026-11-26T05:30:00Z", producto: { name: "Ceviche" } },
      { id: "b", product_id: "p1", forecast_date: fecha, predicted_quantity: 90, model: "xgb-demo", created_at: "2026-11-26T06:00:00Z", producto: { name: "Ceviche" } },
      { id: "c", product_id: "p2", forecast_date: fecha, predicted_quantity: 15, model: "xgb-demo", created_at: "2026-11-26T06:00:00Z", producto: { name: "Chicha" } },
    ];
    const base = crearBase({ demand_forecasts: filas.map((f) => ({ ...f, restaurant_id: "r" })), product_daily_stock: [] });
    vi.mocked(crearClienteServidor).mockResolvedValue(base as never);
    const resumen = await obtenerPrediccionManana("r", new Date("2026-11-26T18:00:00Z"));
    expect(resumen).toMatchObject({ modelo: `${MODELO_SUGERENCIA_STOCK}, xgb-demo`, esDemo: false, platosDemo: ["p2"] });
    expect(resumen.platos.map((plato) => [plato.productoId, plato.cantidadPrevista])).toEqual([["p1", 20], ["p2", 15]]);
  });
});

describe("US-146: platos agotados para el dueño", () => {
  it("lista los agotados de días pasados y de hoy con la hora aproximada del quiebre", async () => {
    const pedido = (created_at: string, status = "DELIVERED") => {
      const orden = { created_at, status, restaurant_id: "r" };
      return { pedido: orden, orders: orden };
    };
    const base = crearBase({
      daily_product_sales: [
        { id: "1", restaurant_id: "r", product_id: "p1", sales_date: "2026-11-24", initial_stock: 3, sold_out: true, producto: { name: "Ceviche" } },
        { id: "2", restaurant_id: "r", product_id: "p2", sales_date: "2026-11-24", initial_stock: 9, sold_out: false, producto: { name: "Chicha" } },
        { id: "3", restaurant_id: "otro", product_id: "p1", sales_date: "2026-11-24", initial_stock: 1, sold_out: true, producto: { name: "Ajeno" } },
      ],
      product_daily_stock: [
        { id: "s1", restaurant_id: "r", product_id: "p2", stock_date: HOY, quantity: 2, sold: 2, producto: { name: "Chicha" } },
        { id: "s2", restaurant_id: "r", product_id: "p3", stock_date: HOY, quantity: 5, sold: 1, producto: { name: "Arroz" } },
      ],
      order_items: [
        // 24/11 en Lima: 2 a las 13:00, cancelado de 5 a las 13:30, 1 a las 14:10 → quiebre 14:10.
        { id: "i1", product_id: "p1", quantity: 2, stock_reserved: true, ...pedido("2026-11-24T18:00:00Z") },
        { id: "i2", product_id: "p1", quantity: 5, stock_reserved: true, ...pedido("2026-11-24T18:30:00Z", "CANCELLED") },
        { id: "i3", product_id: "p1", quantity: 1, stock_reserved: true, ...pedido("2026-11-24T19:10:00Z") },
        { id: "i4", product_id: "p2", quantity: 2, stock_reserved: true, ...pedido("2026-11-26T15:45:00Z") },
      ],
    });
    vi.mocked(crearClienteServidor).mockResolvedValue(base as never);
    const agotados = await obtenerAgotadosRecientes("r", Date.parse("2026-11-26T17:00:00Z"));
    expect(agotados).toEqual([
      { productoId: "p2", nombre: "Chicha", fecha: HOY, stockInicial: 2, quiebre: "2026-11-26T15:45:00Z" },
      { productoId: "p1", nombre: "Ceviche", fecha: "2026-11-24", stockInicial: 3, quiebre: "2026-11-24T19:10:00Z" },
    ]);
  });
});
