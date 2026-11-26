import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { aCentimos } from "../pedidos/validacion";
import type { Devolucion, EstadoDevolucion } from "./devoluciones-logica";

type FilaDevolucion = {
  id: string;
  order_id: string;
  amount: number | string;
  reason: string;
  status: EstadoDevolucion;
  requested_at: string;
  refunded_at: string | null;
  solicitante: { full_name: string } | null;
  responsable: { full_name: string } | null;
  pedido: { order_number: number; daily_number: number | null; business_date: string | null } | null;
};

const COLUMNAS =
  "id, order_id, amount, reason, status, requested_at, refunded_at, " +
  "solicitante:users!order_refunds_requested_by_fkey(full_name), " +
  "responsable:users!order_refunds_refunded_by_fkey(full_name), " +
  "pedido:orders!order_refunds_order_id_fkey(order_number, daily_number, business_date)";

function aDevolucion(fila: FilaDevolucion): Devolucion {
  return {
    id: fila.id,
    pedidoId: fila.order_id,
    numeroPedido: Number(fila.pedido?.daily_number ?? fila.pedido?.order_number ?? 0),
    fechaPedido: fila.pedido?.business_date ?? null,
    montoCentimos: aCentimos(fila.amount),
    motivo: fila.reason,
    estado: fila.status,
    solicitadaPor: fila.solicitante?.full_name ?? null,
    solicitadaEn: fila.requested_at,
    devueltaPor: fila.refunded_at ? fila.responsable?.full_name ?? "Personal" : null,
    devueltaEn: fila.refunded_at,
  };
}

// RLS: solo caja, dueño y admin leen order_refunds.
export async function obtenerDevolucionPedido(restauranteId: string, pedidoId: string): Promise<Devolucion | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("order_refunds").select(COLUMNAS)
    .eq("restaurant_id", restauranteId).eq("order_id", pedidoId).maybeSingle()
    .overrideTypes<FilaDevolucion | null, { merge: false }>();
  if (error) {
    console.error("obtenerDevolucionPedido", error.code);
    throw new Error("No se pudo consultar la devolución.");
  }
  return data ? aDevolucion(data) : null;
}

export async function listarDevolucionesPendientes(restauranteId: string): Promise<Devolucion[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("order_refunds").select(COLUMNAS)
    .eq("restaurant_id", restauranteId).eq("status", "PENDING")
    .order("requested_at", { ascending: true }).limit(100)
    .overrideTypes<FilaDevolucion[], { merge: false }>();
  if (error) {
    console.error("listarDevolucionesPendientes", error.code);
    throw new Error("No se pudieron consultar las devoluciones.");
  }
  return data.map(aDevolucion);
}

export async function marcarDevolucionRealizada(devolucionId: string): Promise<{ ok: true } | { ok: false; codigo: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("marcar_devolucion_realizada", { p_devolucion_id: devolucionId });
  if (error) return { ok: false, codigo: error.message };
  return { ok: true };
}
