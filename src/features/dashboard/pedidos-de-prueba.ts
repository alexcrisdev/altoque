import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const PREFIJOS_PRUEBA = [
  "PRUEBA E2E",
  "Prueba US-",
  "Prueba local US-",
  "Prueba Checkout snapshot US-",
];
const TAMANO_PAGINA = 500;
const TAMANO_LOTE = 100;

type RespuestaPagina<T> = {
  data: T[] | null;
  count: number | null;
  error: unknown;
};

export class ConsultaPedidosDePruebaError extends Error {
  constructor() {
    super("No se pudieron identificar los pedidos de prueba.");
  }
}

async function leerPaginas<T>(
  consultar: (desde: number, hasta: number) => PromiseLike<RespuestaPagina<T>>,
): Promise<T[]> {
  const filas: T[] = [];
  let total: number | null = null;
  while (true) {
    const { data, count, error } = await consultar(filas.length, filas.length + TAMANO_PAGINA - 1);
    if (error || data === null || count === null || !Number.isSafeInteger(count)
      || count < filas.length + data.length || (total !== null && total !== count)) {
      throw new ConsultaPedidosDePruebaError();
    }
    total = count;
    filas.push(...data);
    if (filas.length === total) return filas;
    if (!data.length) throw new ConsultaPedidosDePruebaError();
  }
}

export async function obtenerIdsPedidosDePrueba(
  cliente: SupabaseClient,
  restauranteId: string,
): Promise<ReadonlySet<string>> {
  const idsPorPrefijo = await Promise.all(PREFIJOS_PRUEBA.map(async (prefijo) => {
    const patron = `${prefijo}%`;
    const [pedidos, lineas] = await Promise.all([
      leerPaginas((desde, hasta) => cliente.from("orders").select("id", { count: "exact" })
        .eq("restaurant_id", restauranteId).like("customer_name", patron)
        .order("id").range(desde, hasta)),
      leerPaginas((desde, hasta) => cliente.from("order_items")
        .select("order_id, orders!inner(restaurant_id)", { count: "exact" })
        .eq("orders.restaurant_id", restauranteId).like("observation", patron)
        .order("id").range(desde, hasta)),
    ]);
    return [...pedidos.map((pedido) => pedido.id), ...lineas.map((linea) => linea.order_id)];
  }));
  return new Set(idsPorPrefijo.flat());
}

export function esPedidoDePrueba(id: string, idsDePrueba: ReadonlySet<string>): boolean {
  return idsDePrueba.has(id);
}

type PedidoSesion = { id: string; table_session_id: string };
type Cuenta = { order_id: string | null; table_session_id: string | null };

export function sesionesSoloDePrueba(
  pedidos: readonly PedidoSesion[],
  idsDePrueba: ReadonlySet<string>,
): ReadonlySet<string> {
  const sesionesDePrueba = new Set<string>();
  const sesionesConPedidosReales = new Set<string>();
  for (const pedido of pedidos) {
    const destino = esPedidoDePrueba(pedido.id, idsDePrueba) ? sesionesDePrueba : sesionesConPedidosReales;
    destino.add(pedido.table_session_id);
  }
  for (const id of sesionesConPedidosReales) sesionesDePrueba.delete(id);
  return sesionesDePrueba;
}

export async function obtenerSesionesSoloDePrueba(
  cliente: SupabaseClient,
  restauranteId: string,
  sesiones: readonly string[],
  idsDePrueba: ReadonlySet<string>,
): Promise<ReadonlySet<string>> {
  if (!idsDePrueba.size) return new Set();
  const idsSesion = [...new Set(sesiones)];
  const pedidos: PedidoSesion[] = [];
  for (let inicio = 0; inicio < idsSesion.length; inicio += TAMANO_LOTE) {
    const lote = idsSesion.slice(inicio, inicio + TAMANO_LOTE);
    pedidos.push(...await leerPaginas((desde, hasta) => cliente.from("orders")
      .select("id, table_session_id", { count: "exact" })
      .eq("restaurant_id", restauranteId).in("table_session_id", lote)
      .order("id").range(desde, hasta)));
  }
  return sesionesSoloDePrueba(pedidos, idsDePrueba);
}

export function cuentaDePrueba(
  cuenta: Cuenta,
  idsDePrueba: ReadonlySet<string>,
  sesionesDePrueba: ReadonlySet<string>,
): boolean {
  if (cuenta.order_id) return esPedidoDePrueba(cuenta.order_id, idsDePrueba);
  return !!cuenta.table_session_id && sesionesDePrueba.has(cuenta.table_session_id);
}

export async function filtrarCuentasReales<T extends Cuenta>(
  cliente: SupabaseClient,
  restauranteId: string,
  cuentas: readonly T[],
  idsDePrueba: ReadonlySet<string>,
): Promise<T[]> {
  const sesiones = cuentas.flatMap((cuenta) => cuenta.table_session_id ? [cuenta.table_session_id] : []);
  const sesionesDePrueba = await obtenerSesionesSoloDePrueba(cliente, restauranteId, sesiones, idsDePrueba);
  return cuentas.filter((cuenta) => !cuentaDePrueba(cuenta, idsDePrueba, sesionesDePrueba));
}
