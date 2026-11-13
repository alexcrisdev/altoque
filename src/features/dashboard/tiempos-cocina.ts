import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { rangoLimaAUtc } from "./ventas-logica";
import { calcularTiemposCocina, type EventoCocina, type PedidoCocina } from "./tiempos-cocina-logica";

type Fila = { id: string };
type Consulta<T> = {
  order(columna: string, opciones: { ascending: boolean }): {
    range(inicio: number, fin: number): PromiseLike<{
      data: T[] | null; error: unknown; count: number | null;
    }>;
  };
};

async function leerTodas<T extends Fila>(consulta: () => Consulta<T>): Promise<T[]> {
  const filas: T[] = [];
  const ids = new Set<string>();
  let esperado: number | null = null;
  while (true) {
    const { data, error, count } = await consulta().order("id", { ascending: true })
      .range(filas.length, filas.length + 499);
    if (error || data === null || count === null || !Number.isSafeInteger(count) || count < 0
      || (esperado !== null && esperado !== count)) throw new Error("Consulta incompleta.");
    esperado = count;
    for (const fila of data) {
      if (ids.has(fila.id)) throw new Error("Consulta duplicada.");
      ids.add(fila.id);
      filas.push(fila);
    }
    if (filas.length > count) throw new Error("Consulta inconsistente.");
    if (filas.length === count) return filas;
    if (!data.length) throw new Error("Faltan registros.");
  }
}

export async function obtenerTiemposCocina(restauranteId: string, desde: string, hasta: string) {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(desde, hasta);
  if (!restauranteId.trim()) throw new Error("Restaurante no válido.");
  const supabase = await crearClienteServidor();
  const candidatos = await leerTodas<Fila & { order_id: string }>(() => supabase
    .from("order_status_history").select("id, order_id", { count: "exact" })
    .eq("restaurant_id", restauranteId).eq("event", "STATUS").eq("to_status", "IN_PROGRESS")
    .gte("created_at", desdeUtc).lt("created_at", hastaUtcExclusivo));
  const ids = [...new Set(candidatos.map((evento) => evento.order_id))];
  const historial: EventoCocina[] = [];
  const pedidos: PedidoCocina[] = [];
  // Lotes acotados para las URL. Cada consulta pagina sus filas de 500 en 500.
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const lote = ids.slice(inicio, inicio + 100);
    // Sin límites de fecha: necesitamos el primer ingreso real y el último READY,
    // aunque estén fuera del rango. El cálculo filtra por el primer IN_PROGRESS.
    historial.push(...await leerTodas<Fila & EventoCocina>(() => supabase
      .from("order_status_history")
      .select("id, order_id, to_status, event, created_at", { count: "exact" })
      .eq("restaurant_id", restauranteId).eq("event", "STATUS").in("order_id", lote)));
    pedidos.push(...await leerTodas<PedidoCocina>(() => supabase.from("orders")
      .select("id, status, order_items(product_name)", { count: "exact" })
      .eq("restaurant_id", restauranteId).in("id", lote).neq("status", "CANCELLED")));
  }
  return calcularTiemposCocina(pedidos, historial, desde, hasta);
}
