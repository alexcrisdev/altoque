import { describe, expect, it } from "vitest";
import {
  armarFotoMetricas, calcularPeriodos, fechaCorta, horaPico, type DatosFoto, type DatosPeriodo,
} from "../../src/features/ia/toqui-admin/foto-logica";
import type { PanelVivo } from "../../src/features/dashboard/panel-vivo";
import type { ResumenTendencias } from "../../src/features/dashboard/tendencias";
import type { FranjaMapa } from "../../src/features/dashboard/mapa-calor-logica";
import type { ResumenVentas } from "../../src/features/dashboard/ventas-logica";

// US-152: foto de métricas de Toqui (lógica pura, sin base).
const AHORA = Date.parse("2026-11-27T20:40:00Z"); // 27/11/2026 15:40 en Lima

const estados = (n: Partial<Record<string, number>>) =>
  ({ PENDING: 0, ACCEPTED: 0, IN_PROGRESS: 0, READY: 0, DELIVERED: 0, CANCELLED: 0, ...n }) as ResumenTendencias["porEstado"];

function tendencias(productos: [string, number][], porEstado: Partial<Record<string, number>>): ResumenTendencias {
  const total = Object.values(porEstado).reduce<number>((suma, n) => suma + (n ?? 0), 0);
  return { productos: productos.map(([nombre, unidades], i) => ({ productId: `p${i}`, nombre, unidades })), porEstado: estados(porEstado), total };
}
const ventas = (centimos: number, cuentas: number): ResumenVentas => ({
  ventasCentimos: centimos, cuentasPagadas: cuentas, ticketPromedioCentimos: cuentas ? Math.round(centimos / cuentas) : 0,
  porMetodo: { CASH: centimos, YAPE: 0, CARD: 0 },
});
const comp = (hoy: number | null, ayer: number | null, variacionPct: number | null) => ({ hoy, ayer, variacionPct });

function celdas(pedidosPorClave: Record<string, number>, diasEnRango = 1): FranjaMapa[] {
  const lista: FranjaMapa[] = [];
  for (let dia = 0; dia < 7; dia++) for (let hora = 0; hora < 24; hora++) {
    const pedidos = pedidosPorClave[`${dia}:${hora}`] ?? 0;
    lista.push({ dia, hora, diasEnRango, pedidos, promedio: pedidos / diasEnRango, bajaDemanda: false });
  }
  return lista;
}

const PANEL: PanelVivo = {
  fecha: "2026-11-27",
  horaCorte: "15:40",
  ventas: comp(84050, 70000, 20),
  pedidos: comp(15, 12, 25),
  ticket: comp(5603, 5833, -4),
  cocinaMin: comp(14, 16, -13),
  satisfaccion: comp(4.6, 4.4, 5),
  porHora: Array.from({ length: 24 }, (_, h) => (h === 13 ? 30000 : h === 12 ? 20000 : 0)),
  porMetodo: { CASH: 84050, YAPE: 0, CARD: 0 },
  top: [],
  mesas: [{ id: "m1", numero: 1, estado: "OCUPADA" }],
  esperandoPago: 1,
  stock: { bajo: [{ nombre: "Ceviche", quedan: 2 }], agotados: ["Chicha morada"] },
};

const PLATOS: [string, number][] = [
  ["Lomo saltado", 40], ["Ceviche", 35], ["Arroz chaufa", 20], ["Ají de gallina", 12], ["Causa", 9],
  ["Papa a la huancaína", 6], ["Chicharrón", 4], ["Leche de tigre", 2], ["Suspiro", 1],
];

function periodo(conDatos: boolean): DatosPeriodo {
  return conDatos
    ? {
        ventas: ventas(500000, 90), ventasAnterior: ventas(400000, 80),
        tendencias: tendencias(PLATOS, { DELIVERED: 95, CANCELLED: 5 }),
        cocina: { total: { pedidos: 95, promedioMs: 15 * 60_000, maximoMs: 40 * 60_000 }, porDia: [], porFranja: [], porPlato: [] },
        mapa: { celdas: celdas({ "4:13": 14, "5:13": 10, "4:20": 5 }) },
      }
    : { ventas: ventas(0, 0), ventasAnterior: ventas(0, 0), tendencias: tendencias([], {}), cocina: { total: null, porDia: [], porFranja: [], porPlato: [] }, mapa: { celdas: celdas({}) } };
}

function datos(conDatos = true): DatosFoto {
  return {
    periodos: calcularPeriodos(AHORA),
    panel: conDatos ? PANEL : { ...PANEL, ventas: comp(0, 0, null), pedidos: comp(0, 0, null), porHora: Array(24).fill(0), stock: { bajo: [], agotados: [] } },
    hoyTendencias: conDatos ? tendencias(PLATOS.slice(0, 7), { DELIVERED: 15, CANCELLED: 1 }) : tendencias([], {}),
    semana: periodo(conDatos),
    mes: periodo(conDatos),
    agotados: conDatos ? [{ productoId: "p9", nombre: "Chicha morada", fecha: "2026-11-25", stockInicial: 20, quiebre: null }] : [],
    prediccion: {
      fecha: "2026-11-28", dia: "sábado", modelo: "promedio-ponderado-v1", esDemo: false,
      platos: conDatos ? [{ productoId: "p0", nombre: "Lomo saltado", stockRegistrado: 10, cantidadPrevista: 18, faltantes: 8, alerta: true }] : [],
    },
  };
}

describe("calcularPeriodos (hora de Lima)", () => {
  it("hoy, últimos 7 y 30 días incluyen hoy y comparan con el período anterior del mismo largo", () => {
    const p = calcularPeriodos(AHORA);
    expect(p).toMatchObject({ hoy: "2026-11-27", ayer: "2026-11-26", horaCorte: "15:40" });
    expect(p.semana).toEqual({ desde: "2026-11-21", hasta: "2026-11-27", anterior: { desde: "2026-11-14", hasta: "2026-11-20" } });
    expect(p.mes).toEqual({ desde: "2026-10-29", hasta: "2026-11-27", anterior: { desde: "2026-09-29", hasta: "2026-10-28" } });
  });

  it("de noche en Lima ya es mañana en UTC, pero el día sigue siendo el de Lima", () => {
    const p = calcularPeriodos(Date.parse("2026-11-28T03:30:00Z"));
    expect(p).toMatchObject({ hoy: "2026-11-27", horaCorte: "22:30" });
  });

  it("fechaCorta", () => expect(fechaCorta("2026-11-07")).toBe("07/11/2026"));
});

describe("armarFotoMetricas con datos", () => {
  const foto = armarFotoMetricas(datos());

  it("rotula cada período con sus fechas", () => {
    expect(foto.hoy.periodo).toBe("Hoy 27/11/2026 hasta las 15:40");
    expect(foto.hoy.comparadoCon).toBe("ayer 26/11/2026 hasta la misma hora");
    expect(foto.ultimos7Dias.periodo).toBe("Últimos 7 días (del 21/11/2026 al 27/11/2026)");
    expect(foto.ultimos7Dias.comparadoCon).toBe("los 7 días anteriores (del 14/11/2026 al 20/11/2026)");
    expect(foto.ultimos30Dias.periodo).toBe("Últimos 30 días (del 29/10/2026 al 27/11/2026)");
  });

  it("hoy usa los mismos números del panel en vivo, en soles", () => {
    expect(foto.hoy.ventas).toEqual({ valor: 840.5, anterior: 700, variacionPct: 20 });
    expect(foto.hoy.pedidos).toEqual({ valor: 15, anterior: 12, variacionPct: 25 });
    expect(foto.hoy.ticketPromedio).toEqual({ valor: 56.03, anterior: 58.33, variacionPct: -4 });
    expect(foto.hoy.horaPicoVentas).toBe("13:00–14:00 (S/ 300)");
    expect(foto.hoy.cancelados).toBe(1);
    expect(foto.hoy.stockBajo).toEqual([{ nombre: "Ceviche", quedan: 2 }]);
    expect(foto.hoy.agotadosHoy).toEqual(["Chicha morada"]);
  });

  it("7 y 30 días: ventas contra el período anterior, pedidos sin cancelados, cocina y hora pico", () => {
    const s = foto.ultimos7Dias;
    expect(s.sinDatos).toBe(false);
    expect(s.ventas).toEqual({ valor: 5000, anterior: 4000, variacionPct: 25 });
    expect(s.pedidos).toBe(95);
    expect(s.cancelados).toBe(5);
    expect(s.cuentasPagadas).toBe(90);
    expect(s.cocinaMinutosPromedio).toBe(15);
    expect(s.horaPico).toEqual({ hora: "13:00–14:00", pedidosPromedioPorDia: 3.4 });
    expect(s.franjaPico).toBe("viernes 13:00–14:00");
  });

  it("top 5 y menos vendidos 5 (sin repetir los del top)", () => {
    expect(foto.ultimos7Dias.masVendidos?.map((p) => p.nombre)).toEqual(["Lomo saltado", "Ceviche", "Arroz chaufa", "Ají de gallina", "Causa"]);
    expect(foto.ultimos7Dias.menosVendidos).toEqual([
      { nombre: "Suspiro", unidades: 1 }, { nombre: "Leche de tigre", unidades: 2 },
      { nombre: "Chicharrón", unidades: 4 }, { nombre: "Papa a la huancaína", unidades: 6 },
    ]);
    expect(foto.hoy.menosVendidos?.map((p) => p.nombre)).toEqual(["Chicharrón", "Papa a la huancaína"]);
  });

  it("agotados y predicción de mañana", () => {
    expect(foto.agotadosUltimos7Dias).toEqual({ periodo: "del 20/11/2026 al 27/11/2026", platos: [{ nombre: "Chicha morada", fecha: "25/11/2026" }] });
    expect(foto.prediccionManana).toEqual({
      fecha: "28/11/2026", dia: "sábado", esDemo: false,
      platos: [{ nombre: "Lomo saltado", preparar: 18, stockRegistrado: 10, faltan: 8 }],
    });
  });

  it("es chica: se manda entera en cada pregunta", () => {
    expect(JSON.stringify(foto).length).toBeLessThan(4000);
  });
});

describe("armarFotoMetricas sin datos", () => {
  it("marca sinDatos para que Toqui diga «Aún no tengo datos de ese período»", () => {
    const foto = armarFotoMetricas(datos(false));
    expect(foto.hoy.sinDatos).toBe(true);
    expect(foto.ultimos7Dias.sinDatos).toBe(true);
    expect(foto.ultimos30Dias.sinDatos).toBe(true);
    expect(foto.ultimos7Dias.masVendidos).toEqual([]);
    expect(foto.ultimos7Dias.horaPico).toBeNull();
    expect(foto.ultimos7Dias.cocinaMinutosPromedio).toBeNull();
    expect(foto.hoy.horaPicoVentas).toBeNull();
    expect(foto.prediccionManana?.platos).toEqual([]);
  });

  it("una consulta que falló queda en null (no se inventa un cero)", () => {
    const d = datos();
    const foto = armarFotoMetricas({
      ...d, panel: null, prediccion: null, agotados: null,
      semana: { ventas: null, ventasAnterior: null, tendencias: null, cocina: null, mapa: null },
    });
    expect(foto.hoy.ventas).toBeNull();
    expect(foto.prediccionManana).toBeNull();
    expect(foto.agotadosUltimos7Dias).toBeNull();
    expect(foto.ultimos7Dias).toMatchObject({ ventas: null, pedidos: null, masVendidos: null, horaPico: null });
  });

  it("sin ventas del período anterior no hay variación", () => {
    const d = datos();
    const foto = armarFotoMetricas({ ...d, semana: { ...d.semana, ventasAnterior: null } });
    expect(foto.ultimos7Dias.ventas).toEqual({ valor: 5000, anterior: null, variacionPct: null });
  });
});

describe("sin datos personales", () => {
  it("solo copia nombres de platos, montos y conteos (aunque lleguen otros campos)", () => {
    const d = datos();
    const conExtras = {
      ...d,
      hoyTendencias: {
        ...d.hoyTendencias!,
        productos: d.hoyTendencias!.productos.map((p) => ({ ...p, cliente: "Ana Pérez", correo: "ana@correo.pe", telefono: "987654321" })),
      },
      panel: { ...PANEL, mesas: [{ id: "m1", numero: 1, estado: "OCUPADA" as const, cliente: "Ana Pérez" }] },
    };
    const json = JSON.stringify(armarFotoMetricas(conExtras));
    for (const prohibido of ["Ana", "@", "987654321", "cliente", "correo", "telefono", "productId", "mesas"]) {
      expect(json).not.toContain(prohibido);
    }
  });
});

describe("horaPico", () => {
  it("suma todos los días por hora y elige la de más pedidos", () => {
    expect(horaPico(celdas({ "0:12": 3, "1:12": 3, "2:19": 5 }), 7).hora).toEqual({ hora: "12:00–13:00", pedidosPromedioPorDia: 0.9 });
  });
  it("sin pedidos no hay hora pico", () => {
    expect(horaPico(celdas({}), 7)).toEqual({ hora: null, franja: null });
  });
});
