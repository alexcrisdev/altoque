import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { TipoIncidencia } from "./incidencias";

export type IncidenciaPedido = {
  id: string; tipo: TipoIncidencia; descripcion: string; estado: "OPEN" | "RESOLVED";
  creadaPor: string; creadaEn: string; resueltaPor: string | null; resueltaEn: string | null;
};

export async function listarIncidencias(pedidoId: string): Promise<IncidenciaPedido[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("order_incidents")
    .select("id, type, description, status, created_at, resolved_at, created_user:users!order_incidents_created_by_fkey(full_name), resolved_user:users!order_incidents_resolved_by_fkey(full_name)")
    .eq("order_id", pedidoId).order("created_at", { ascending: true })
    .overrideTypes<Array<{ id: string; type: TipoIncidencia; description: string; status: "OPEN" | "RESOLVED"; created_at: string; resolved_at: string | null; created_user: { full_name: string } | null; resolved_user: { full_name: string } | null }>, { merge: false }>();
  if (error) {
    console.error("listarIncidencias", error.code);
    throw new Error("No se pudieron cargar las incidencias. Verifica que Alexander haya aplicado la migración US-014.");
  }
  return data.map((fila) => ({ id: fila.id, tipo: fila.type, descripcion: fila.description, estado: fila.status,
    creadaPor: fila.created_user?.full_name ?? "Personal", creadaEn: fila.created_at,
    resueltaPor: fila.resolved_user?.full_name ?? null, resueltaEn: fila.resolved_at }));
}
