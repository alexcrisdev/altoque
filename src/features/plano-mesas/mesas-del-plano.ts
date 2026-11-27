import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formaYSillas } from "./sillas";

type FilaMesaPlano = {
  id: string; number: number; active: boolean; branch_id: string; floor_cell: number | null;
  // Pueden faltar si la base aún no tiene la migración de forma y sillas.
  shape?: unknown; capacity?: unknown;
  branches: { name: string } | null;
};

// Incluye las mesas inactivas para que el salón tenga las mismas posiciones en ambas vistas.
// Lee todas las columnas (*) para no fallar si la columna shape todavía no existe.
export async function listarMesasDelPlano(restauranteId: string) {
  const cliente = await crearClienteServidor();
  const { data, error } = await cliente.from("dining_tables")
    .select("*, branches(name)")
    .eq("restaurant_id", restauranteId).order("number")
    .overrideTypes<FilaMesaPlano[], { merge: false }>();
  if (error) throw new Error("No se pudo cargar el plano de mesas.");
  return data.map(m => ({
    id: m.id, numero: m.number, activa: m.active, celda: m.floor_cell,
    localId: m.branch_id, local: m.branches?.name || "Salón",
    ...formaYSillas(m),
  }));
}

export type ResultadoPlano = "OK" | "CAMBIADO" | "SIN_PERMISO" | "INVALIDO" | "ERROR";

// La función de la base valida el rol, el local y que nadie haya cambiado el plano.
export async function guardarPlanoMesas(
  localId: string,
  posiciones: Record<string, number>,
  base: Record<string, number>,
): Promise<ResultadoPlano> {
  const cliente = await crearClienteServidor();
  const { error } = await cliente.rpc("guardar_plano_mesas", {
    p_local_id: localId, p_posiciones: posiciones, p_base: base,
  });
  if (!error) return "OK";
  if (error.message.includes("PLANO_CAMBIADO")) return "CAMBIADO";
  if (error.message.includes("FORBIDDEN")) return "SIN_PERMISO";
  if (error.message.includes("PLANO_INVALIDO")) return "INVALIDO";
  return "ERROR";
}
