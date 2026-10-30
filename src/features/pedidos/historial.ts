import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoPedido } from "./estados";

export type CambioEstadoPedido = {
  id: string;
  desde: EstadoPedido | null;
  hacia: EstadoPedido;
  cambiadoPor: string;
  creadoEn: string;
  motivo: string | null;
};

export async function obtenerHistorialPedido(pedidoId: string): Promise<CambioEstadoPedido[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("order_status_history")
    .select("id, from_status, to_status, changed_by, created_at, reason, users(full_name)")
    .eq("order_id", pedidoId)
    .order("created_at", { ascending: true })
    .overrideTypes<Array<{
      id: string;
      from_status: string | null;
      to_status: string;
      changed_by: string | null;
      created_at: string;
      reason: string | null;
      users: { full_name: string } | null;
    }>, { merge: false }>();

  if (error) {
    console.error("obtenerHistorialPedido", error.code);
    throw new Error("No se pudo cargar el historial del pedido.");
  }
  return data.map((fila) => ({
    id: fila.id,
    desde: fila.from_status as EstadoPedido | null,
    hacia: fila.to_status as EstadoPedido,
    cambiadoPor: fila.changed_by ? fila.users?.full_name ?? "Personal" : "Cliente (QR)",
    creadoEn: fila.created_at,
    motivo: fila.reason,
  }));
}
