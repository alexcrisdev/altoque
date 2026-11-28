// US-152: arma la «foto de métricas» que Toqui le pasa a Claude. Lógica pura (sin base):
// recibe lo que ya calculan las funciones del dashboard y lo deja chico, rotulado con su
// período en hora de Lima y SIN datos de clientes (solo platos, montos y conteos).
import type { PanelVivo } from "../../dashboard/panel-vivo";
import { compararConAyer, corteComparacion, type Comparacion } from "../../dashboard/panel-vivo-logica";
import type { ResumenTendencias } from "../../dashboard/tendencias";
import type { ResumenTiempos } from "../../dashboard/tiempos-cocina-logica";
import type { ResumenVentas } from "../../dashboard/ventas-logica";
import { DIAS_MAPA, type FranjaMapa } from "../../dashboard/mapa-calor-logica";
import type { PlatoAgotado } from "../../dashboard/agotados";
import type { ResumenPrediccion } from "../../dashboard/prediccion";
import { sumarDias } from "../../dashboard/sugerencia-stock-logica";

export const TOP_PLATOS = 5;
export const MAX_AGOTADOS = 5;

// ── Períodos ───────────────────────────────────────────────────────────────────────────

export type Rango = { desde: string; hasta: string };
export type Periodos = {
  hoy: string;
  ayer: string;
  horaCorte: string;
  semana: Rango & { anterior: Rango };
  mes: Rango & { anterior: Rango };
};

/** Hoy, últimos 7 y últimos 30 días (incluyen hoy), con el período anterior del mismo largo. */
export function calcularPeriodos(ahora: number): Periodos {
  const { hoy, ayer, horaCorte } = corteComparacion(ahora);
  const rango = (dias: number) => ({
    desde: sumarDias(hoy, -(dias - 1)),
    hasta: hoy,
    anterior: { desde: sumarDias(hoy, -(2 * dias - 1)), hasta: sumarDias(hoy, -dias) },
  });
  return { hoy, ayer, horaCorte, semana: rango(7), mes: rango(30) };
}

/** "2026-11-27" → "27/11/2026". */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}
const textoRango = (r: Rango) => `del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`;

// ── Datos que llegan de las funciones del dashboard (null = esa consulta falló) ──────────

export type DatosPeriodo = {
  ventas: ResumenVentas | null;
  ventasAnterior: ResumenVentas | null;
  tendencias: ResumenTendencias | null; // productos: lista COMPLETA ordenada de más a menos vendido
  cocina: ResumenTiempos | null;
  mapa: { celdas: readonly FranjaMapa[] } | null;
};

export type DatosFoto = {
  periodos: Periodos;
  panel: PanelVivo | null;
  hoyTendencias: ResumenTendencias | null;
  semana: DatosPeriodo;
  mes: DatosPeriodo;
  agotados: PlatoAgotado[] | null;
  prediccion: ResumenPrediccion | null;
};

// ── La foto ────────────────────────────────────────────────────────────────────────────

/** Valor, valor del período anterior y variación % (null = no se puede comparar). */
export type Dato = { valor: number | null; anterior: number | null; variacionPct: number | null };
type Plato = { nombre: string; unidades: number };

export type FotoMetricas = {
  moneda: "S/";
  zonaHoraria: "hora de Lima";
  hoy: {
    periodo: string;
    comparadoCon: string;
    sinDatos: boolean;
    ventas: Dato | null;
    pedidos: Dato | null;
    ticketPromedio: Dato | null;
    cocinaMinutos: Dato | null;
    satisfaccionEstrellas: Dato | null;
    horaPicoVentas: string | null;
    masVendidos: Plato[] | null;
    menosVendidos: Plato[] | null;
    cancelados: number | null;
    stockBajo: { nombre: string; quedan: number }[] | null;
    agotadosHoy: string[] | null;
  };
  ultimos7Dias: ResumenPeriodo;
  ultimos30Dias: ResumenPeriodo;
  agotadosUltimos7Dias: { periodo: string; platos: { nombre: string; fecha: string }[] } | null;
  prediccionManana: {
    fecha: string;
    dia: string;
    esDemo: boolean;
    platos: { nombre: string; preparar: number; stockRegistrado: number | null; faltan: number }[];
  } | null;
};

export type ResumenPeriodo = {
  periodo: string;
  comparadoCon: string;
  sinDatos: boolean;
  ventas: Dato | null;
  cuentasPagadas: number | null;
  ticketPromedio: Dato | null;
  pedidos: number | null; // sin cancelados
  cancelados: number | null;
  cocinaMinutosPromedio: number | null;
  horaPico: { hora: string; pedidos: number; pedidosPromedioPorDia: number } | null; // pedidos = total del período en esa hora
  franjaPico: string | null; // día de la semana y hora con más pedidos
  masVendidos: Plato[] | null;
  menosVendidos: Plato[] | null;
};

/** Céntimos → soles con 2 decimales. */
export const aSoles = (centimos: number) => Math.round(centimos) / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;
const franjaHora = (hora: number) => `${String(hora).padStart(2, "0")}:00–${String((hora + 1) % 24).padStart(2, "0")}:00`;

function dato(c: Comparacion, convertir: (n: number) => number = (n) => n): Dato {
  return {
    valor: c.hoy === null ? null : convertir(c.hoy),
    anterior: c.ayer === null ? null : convertir(c.ayer),
    variacionPct: c.variacionPct,
  };
}

function platos(lista: ResumenTendencias["productos"]) {
  const vendidos = lista.filter((p) => p.unidades > 0).map((p) => ({ nombre: p.nombre, unidades: p.unidades }));
  // Menos vendidos: los últimos de la lista, sin repetir los del top cuando hay pocos platos.
  const menos = vendidos.slice(TOP_PLATOS).slice(-TOP_PLATOS).reverse();
  return { mas: vendidos.slice(0, TOP_PLATOS), menos: menos.length ? menos : vendidos.slice(-1) };
}

/** Hora del día (sumando todos los días) con más pedidos promedio, y la franja día+hora. */
export function horaPico(celdas: readonly FranjaMapa[], dias: number) {
  const porHora = new Map<number, number>();
  for (const c of celdas) porHora.set(c.hora, (porHora.get(c.hora) ?? 0) + c.pedidos);
  let mejor: { hora: number; pedidos: number } | null = null;
  for (const [hora, pedidos] of porHora) if (pedidos > 0 && (!mejor || pedidos > mejor.pedidos)) mejor = { hora, pedidos };
  const celda = celdas.filter((c) => c.diasEnRango > 0 && c.pedidos > 0)
    .reduce<FranjaMapa | null>((m, c) => (!m || c.promedio > m.promedio ? c : m), null);
  return {
    hora: mejor ? { hora: franjaHora(mejor.hora), pedidos: mejor.pedidos, pedidosPromedioPorDia: redondear1(mejor.pedidos / dias) } : null,
    franja: celda ? `${DIAS_MAPA[celda.dia]} ${franjaHora(celda.hora)}` : null,
  };
}

function resumirPeriodo(d: DatosPeriodo, rango: Rango & { anterior: Rango }, dias: number): ResumenPeriodo {
  const t = d.tendencias;
  const cancelados = t ? t.porEstado.CANCELLED ?? 0 : null;
  const pedidos = t ? t.total - (cancelados ?? 0) : null;
  const ventas = d.ventas
    ? dato(compararConAyer(d.ventas.ventasCentimos, d.ventasAnterior?.ventasCentimos ?? null), aSoles)
    : null;
  const ticket = d.ventas
    ? dato(compararConAyer(d.ventas.ticketPromedioCentimos, d.ventasAnterior?.ticketPromedioCentimos ?? null), aSoles)
    : null;
  const lista = t ? platos(t.productos) : null;
  const pico = d.mapa ? horaPico(d.mapa.celdas, dias) : null;
  const sinDatos = (pedidos ?? 0) === 0 && (d.ventas?.ventasCentimos ?? 0) === 0;
  return {
    periodo: `Últimos ${dias} días (${textoRango(rango)})`,
    comparadoCon: `los ${dias} días anteriores (${textoRango(rango.anterior)})`,
    sinDatos,
    ventas,
    cuentasPagadas: d.ventas?.cuentasPagadas ?? null,
    ticketPromedio: ticket,
    pedidos,
    cancelados,
    cocinaMinutosPromedio: d.cocina?.total ? Math.round(d.cocina.total.promedioMs / 60_000) : null,
    horaPico: pico?.hora ?? null,
    franjaPico: pico?.franja ?? null,
    masVendidos: lista?.mas ?? null,
    menosVendidos: lista?.menos ?? null,
  };
}

export function armarFotoMetricas(d: DatosFoto): FotoMetricas {
  const { periodos: p, panel } = d;
  const horaPicoHoy = panel ? panel.porHora.reduce((m, v, h) => (v > 0 && (m === null || v > panel.porHora[m]) ? h : m), null as number | null) : null;
  const listaHoy = d.hoyTendencias ? platos(d.hoyTendencias.productos) : null;
  const pedidosHoy = panel?.pedidos.hoy ?? null;

  return {
    moneda: "S/",
    zonaHoraria: "hora de Lima",
    hoy: {
      periodo: `Hoy ${fechaCorta(p.hoy)} hasta las ${p.horaCorte}`,
      comparadoCon: `ayer ${fechaCorta(p.ayer)} hasta la misma hora`,
      sinDatos: (pedidosHoy ?? 0) === 0 && (panel?.ventas.hoy ?? 0) === 0,
      ventas: panel ? dato(panel.ventas, aSoles) : null,
      pedidos: panel ? dato(panel.pedidos) : null,
      ticketPromedio: panel ? dato(panel.ticket, aSoles) : null,
      cocinaMinutos: panel ? dato(panel.cocinaMin) : null,
      satisfaccionEstrellas: panel ? dato(panel.satisfaccion) : null,
      horaPicoVentas: panel && horaPicoHoy !== null ? `${franjaHora(horaPicoHoy)} (S/ ${aSoles(panel.porHora[horaPicoHoy])})` : null,
      masVendidos: listaHoy?.mas ?? null,
      menosVendidos: listaHoy?.menos ?? null,
      cancelados: d.hoyTendencias ? d.hoyTendencias.porEstado.CANCELLED ?? 0 : null,
      stockBajo: panel?.stock ? panel.stock.bajo.slice(0, MAX_AGOTADOS).map((s) => ({ nombre: s.nombre, quedan: s.quedan })) : null,
      agotadosHoy: panel?.stock ? panel.stock.agotados.slice(0, MAX_AGOTADOS) : null,
    },
    ultimos7Dias: resumirPeriodo(d.semana, p.semana, 7),
    ultimos30Dias: resumirPeriodo(d.mes, p.mes, 30),
    agotadosUltimos7Dias: d.agotados
      ? {
          periodo: `del ${fechaCorta(sumarDias(p.hoy, -7))} al ${fechaCorta(p.hoy)}`,
          platos: d.agotados.slice(0, MAX_AGOTADOS).map((a) => ({ nombre: a.nombre, fecha: fechaCorta(a.fecha) })),
        }
      : null,
    prediccionManana: d.prediccion
      ? {
          fecha: fechaCorta(d.prediccion.fecha),
          dia: d.prediccion.dia,
          esDemo: d.prediccion.esDemo,
          platos: d.prediccion.platos.map((pl) => ({
            nombre: pl.nombre, preparar: pl.cantidadPrevista, stockRegistrado: pl.stockRegistrado, faltan: pl.faltantes,
          })),
        }
      : null,
  };
}
