import "server-only";

import type { crearClienteAdmin } from "../../lib/supabase/admin";
import {
  calcularTiemposCocina,
  type EventoCocina,
  type PedidoCocina,
} from "../dashboard/tiempos-cocina-logica";
import { ETIQUETA_ESTADO, type EstadoPedido } from "./estados";
import { fechaLima, PEDIDOS_MINIMOS_PROMEDIO, type EventoEstado } from "./linea-tiempo";

type ClienteAdmin = ReturnType<typeof crearClienteAdmin>;

const DIAS_PROMEDIO = 7;
const PEDIDOS_PROMEDIO = 50;

function esEstado(valor: string | null): valor is EstadoPedido {
  return valor !== null && Object.hasOwn(ETIQUETA_ESTADO, valor);
}

/**
 * US-092: historial de estados de UN pedido ya validado por QR + clave.
 * Solo devuelve estado anterior, nuevo y hora: nunca quién lo cambió ni motivos.
 * Si la consulta falla devuelve [] (sin horas), igual que el promedio de cocina.
 */
export async function leerEventosPedido(
  supabase: ClienteAdmin,
  restauranteId: string,
  pedidoId: string,
): Promise<EventoEstado[]> {
  const { data, error } = await supabase
    .from("order_status_history")
    .select("from_status, to_status, created_at")
    .eq("restaurant_id", restauranteId)
    .eq("order_id", pedidoId)
    .eq("event", "STATUS")
    .order("created_at", { ascending: true })
    .limit(50)
    .overrideTypes<
      { from_status: string | null; to_status: string; created_at: string }[],
      { merge: false }
    >();

  // Si falla, el seguimiento se muestra sin horas en vez de caerse.
  if (error) {
    console.error("leerEventosPedido", error.code);
    return [];
  }

  return data.flatMap((fila) =>
    esEstado(fila.to_status)
      ? [{
          desde: esEstado(fila.from_status) ? fila.from_status : null,
          hacia: fila.to_status,
          creadoEn: fila.created_at,
        }]
      : [],
  );
}

/**
 * Promedio de preparación (En cocina → Listo) de los últimos pedidos del restaurante.
 * Reutiliza el cálculo de US-081. Devuelve null si hay pocos datos o falla
 * (el tiempo estimado no debe romper el seguimiento).
 */
export async function leerPromedioCocinaMs(
  supabase: ClienteAdmin,
  restauranteId: string,
  ahora: number,
): Promise<number | null> {
  const desdeMs = ahora - DIAS_PROMEDIO * 24 * 60 * 60 * 1000;

  const pedidos = await supabase
    .from("orders")
    .select("id, status, order_items(product_name)")
    .eq("restaurant_id", restauranteId)
    .in("status", ["READY", "DELIVERED"])
    .gte("created_at", new Date(desdeMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(PEDIDOS_PROMEDIO)
    .overrideTypes<PedidoCocina[], { merge: false }>();

  if (pedidos.error) {
    console.error("leerPromedioCocinaMs:pedidos", pedidos.error.code);
    return null;
  }
  if (pedidos.data.length < PEDIDOS_MINIMOS_PROMEDIO) return null;

  const historial = await supabase
    .from("order_status_history")
    .select("order_id, to_status, event, created_at")
    .eq("restaurant_id", restauranteId)
    .eq("event", "STATUS")
    .in("to_status", ["IN_PROGRESS", "READY"])
    .in("order_id", pedidos.data.map((pedido) => pedido.id))
    .overrideTypes<EventoCocina[], { merge: false }>();

  if (historial.error) {
    console.error("leerPromedioCocinaMs:historial", historial.error.code);
    return null;
  }

  try {
    const { total } = calcularTiemposCocina(
      pedidos.data,
      historial.data,
      fechaLima(desdeMs),
      fechaLima(ahora),
    );
    return total && total.pedidos >= PEDIDOS_MINIMOS_PROMEDIO ? total.promedioMs : null;
  } catch {
    return null;
  }
}
