import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import {
  ConsultaPedidosDePruebaError,
  esPedidoDePrueba, filtrarCuentasReales, obtenerIdsPedidosDePrueba, obtenerSesionesSoloDePrueba,
} from "./pedidos-de-prueba";
import { calcularResumenVentas, rangoLimaAUtc, type PagoVenta } from "./ventas-logica";
import { obtenerTiemposCocina } from "./tiempos-cocina";
import { obtenerTendencias } from "./tendencias";
import { obtenerSatisfaccionDia } from "./satisfaccion";
import type { ProductoMasVendido } from "./tendencias-logica";
import {
  alertasStock,
  compararConAyer,
  estadoMesas,
  fechasHoyAyer,
  ventasPorHora,
  type Comparacion,
  type EstadoMesa,
  type PagoHora,
} from "./panel-vivo-logica";
import type { MetodoPago } from "../pago-cierre/cuenta-logica";

export type PanelVivo = {
  fecha: string;
  ventas: Comparacion;
  pedidos: Comparacion;
  ticket: Comparacion;
  cocinaMin: Comparacion;
  satisfaccion: Comparacion;
  porHora: number[];
  porMetodo: Record<MetodoPago, number> | null;
  top: ProductoMasVendido[];
  mesas: { id: string; numero: number; estado: EstadoMesa }[];
  esperandoPago: number | null;
  stock: { bajo: { nombre: string; quedan: number }[]; agotados: string[] } | null;
};

// Una sección que falla no tumba el panel: se muestra "—".
async function seguro<T>(nombre: string, tarea: () => Promise<T>): Promise<T | null> {
  try {
    return await tarea();
  } catch (error) {
    if (error instanceof ConsultaPedidosDePruebaError) throw error;
    console.error("panelVivo", nombre);
    return null;
  }
}

type PagoFila = PagoVenta & PagoHora & { id: string };

// US-145 (US-111): conteo exacto. Se pagina por «id mayor que el último leído», no por
// posición: si entra un pedido o pago mientras se pagina, ninguna fila se cuenta dos veces
// ni se salta (con range, una fila nueva desplaza las siguientes de página).
const TAMANO_PAGINA = 500;
async function leerPorId<T extends { id: string }>(
  nombre: string,
  pagina: (despuesDe: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let despuesDe: string | null = null; ;) {
    const { data, error } = await pagina(despuesDe);
    if (error || !data) throw new Error(nombre);
    filas.push(...data);
    if (data.length < TAMANO_PAGINA) return filas;
    despuesDe = data[data.length - 1].id;
  }
}

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

async function pagosDelDia(
  supabase: Cliente, restauranteId: string, fecha: string, idsDePrueba: ReadonlySet<string>,
): Promise<PagoFila[]> {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(fecha, fecha);
  const filas = await leerPorId("pagos", (despuesDe) => {
    let consulta = supabase.from("payments")
      .select("id, table_session_id, order_id, method, status, amount, confirmed_at")
      .eq("restaurant_id", restauranteId).eq("status", "CONFIRMED")
      .gte("confirmed_at", desdeUtc).lt("confirmed_at", hastaUtcExclusivo);
    if (despuesDe) consulta = consulta.gt("id", despuesDe);
    return consulta.order("id").limit(TAMANO_PAGINA).overrideTypes<PagoFila[], { merge: false }>();
  });
  return filtrarCuentasReales(supabase, restauranteId, filas, idsDePrueba);
}

async function pedidosDelDia(
  supabase: Cliente, restauranteId: string, fecha: string, idsDePrueba: ReadonlySet<string>,
): Promise<number> {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(fecha, fecha);
  const pedidos = await leerPorId("pedidos", (despuesDe) => {
    let consulta = supabase.from("orders").select("id")
      .eq("restaurant_id", restauranteId).neq("status", "CANCELLED")
      .gte("created_at", desdeUtc).lt("created_at", hastaUtcExclusivo);
    if (despuesDe) consulta = consulta.gt("id", despuesDe);
    return consulta.order("id").limit(TAMANO_PAGINA);
  });
  // Sin cancelados (filtro de arriba) ni pedidos de prueba (regla de US-111).
  return pedidos.filter((pedido) => !esPedidoDePrueba(pedido.id, idsDePrueba)).length;
}

async function cocinaMinutos(restauranteId: string, fecha: string, idsDePrueba: ReadonlySet<string>): Promise<number | null> {
  const { total } = await obtenerTiemposCocina(restauranteId, fecha, fecha, idsDePrueba);
  return total ? Math.round(total.promedioMs / 60_000) : null;
}

async function satisfaccion(restauranteId: string, fecha: string, idsDePrueba: ReadonlySet<string>): Promise<number | null> {
  const { servicio } = await obtenerSatisfaccionDia(restauranteId, fecha, idsDePrueba);
  return servicio === null ? null : Math.round(servicio * 10) / 10;
}

async function pedidosPendientes(supabase: Cliente, restauranteId: string, idsDePrueba: ReadonlySet<string>) {
  const pendientes = await leerPorId("pedidos pendientes", (despuesDe) => {
    let consulta = supabase.from("orders").select("id, table_session_id")
      .eq("restaurant_id", restauranteId).eq("status", "PENDING");
    if (despuesDe) consulta = consulta.gt("id", despuesDe);
    return consulta.order("id").limit(TAMANO_PAGINA);
  });
  return pendientes.filter((pedido) => !esPedidoDePrueba(pedido.id, idsDePrueba));
}

async function mesas(supabase: Cliente, restauranteId: string, idsDePrueba: ReadonlySet<string>) {
  const [tablas, sesiones, pendientes] = await Promise.all([
    supabase.from("dining_tables").select("id, number").eq("restaurant_id", restauranteId).eq("active", true)
      .overrideTypes<{ id: string; number: number }[], { merge: false }>(),
    supabase.from("table_sessions").select("id, dining_table_id").eq("restaurant_id", restauranteId)
      .is("closed_at", null).overrideTypes<{ id: string; dining_table_id: string }[], { merge: false }>(),
    pedidosPendientes(supabase, restauranteId, idsDePrueba),
  ]);
  if (tablas.error || sesiones.error) throw new Error("mesas");
  const sesionesDePrueba = await obtenerSesionesSoloDePrueba(
    supabase, restauranteId, sesiones.data.map((sesion) => sesion.id), idsDePrueba,
  );
  const conPendientes = new Set(pendientes.flatMap((p) => p.table_session_id ? [p.table_session_id] : []));
  return {
    mesas: estadoMesas(
      tablas.data.map((t) => ({ id: t.id, numero: t.number })),
      sesiones.data.filter((s) => !sesionesDePrueba.has(s.id)).map((s) => ({ id: s.id, mesaId: s.dining_table_id })),
      conPendientes,
    ),
    esperandoPago: pendientes.length,
  };
}

async function stock(restauranteId: string, fecha: string) {
  const supabase = await crearClienteServidor();
  const [diario, productos] = await Promise.all([
    supabase.from("product_daily_stock").select("quantity, sold, products(name)")
      .eq("restaurant_id", restauranteId).eq("stock_date", fecha)
      .overrideTypes<{ quantity: number; sold: number; products: { name: string } | null }[], { merge: false }>(),
    supabase.from("products").select("name").eq("restaurant_id", restauranteId)
      .eq("active", true).eq("available", false)
      .overrideTypes<{ name: string }[], { merge: false }>(),
  ]);
  if (diario.error || productos.error) throw new Error("stock");
  return alertasStock(
    diario.data.map((f) => ({ nombre: f.products?.name ?? "Plato", cantidad: Number(f.quantity), vendidos: Number(f.sold) })),
    productos.data.map((p) => p.name),
  );
}

export async function obtenerPanelVivo(restauranteId: string, ahora = Date.now()): Promise<PanelVivo> {
  if (!restauranteId.trim()) throw new Error("Restaurante inválido.");
  const { hoy, ayer } = fechasHoyAyer(ahora);
  const supabase = await crearClienteServidor();
  const idsDePrueba = await obtenerIdsPedidosDePrueba(supabase, restauranteId);

  const [pagosHoy, pagosAyer, pedHoy, pedAyer, cocHoy, cocAyer, satHoy, satAyer, tendencias, estadoMesa, alertas] =
    await Promise.all([
      seguro("pagosHoy", () => pagosDelDia(supabase, restauranteId, hoy, idsDePrueba)),
      seguro("pagosAyer", () => pagosDelDia(supabase, restauranteId, ayer, idsDePrueba)),
      seguro("pedidosHoy", () => pedidosDelDia(supabase, restauranteId, hoy, idsDePrueba)),
      seguro("pedidosAyer", () => pedidosDelDia(supabase, restauranteId, ayer, idsDePrueba)),
      seguro("cocinaHoy", () => cocinaMinutos(restauranteId, hoy, idsDePrueba)),
      seguro("cocinaAyer", () => cocinaMinutos(restauranteId, ayer, idsDePrueba)),
      seguro("satisfaccionHoy", () => satisfaccion(restauranteId, hoy, idsDePrueba)),
      seguro("satisfaccionAyer", () => satisfaccion(restauranteId, ayer, idsDePrueba)),
      seguro("top", () => obtenerTendencias(restauranteId, hoy, hoy, idsDePrueba)),
      seguro("mesas", () => mesas(supabase, restauranteId, idsDePrueba)),
      seguro("stock", () => stock(restauranteId, hoy)),
    ]);

  // Ventas = pagos CONFIRMED (US-018); el ticket usa cuentas pagadas.
  const resumenHoy = pagosHoy ? calcularResumenVentas(pagosHoy) : null;
  const resumenAyer = pagosAyer ? calcularResumenVentas(pagosAyer) : null;

  return {
    fecha: hoy,
    ventas: compararConAyer(resumenHoy?.ventasCentimos ?? null, resumenAyer?.ventasCentimos ?? null),
    pedidos: compararConAyer(pedHoy, pedAyer),
    ticket: compararConAyer(resumenHoy?.ticketPromedioCentimos ?? null, resumenAyer?.ticketPromedioCentimos ?? null),
    cocinaMin: compararConAyer(cocHoy, cocAyer),
    satisfaccion: compararConAyer(satHoy, satAyer),
    porHora: ventasPorHora(pagosHoy ?? []),
    porMetodo: resumenHoy?.porMetodo ?? null,
    top: tendencias?.productos.slice(0, 5) ?? [],
    mesas: estadoMesa?.mesas ?? [],
    esperandoPago: estadoMesa?.esperandoPago ?? null,
    stock: alertas,
  };
}
