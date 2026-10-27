import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

// Capa de datos del QR de mostrador (para llevar): uno por local, sin mesa.
// Usa la sesión del usuario: RLS también protege cada operación.

export type MostradorAdmin = {
  localId: string;
  local: string;
  tieneQrActivo: boolean;
};

type FilaLocal = {
  id: string;
  name: string;
  qr_codes: { active: boolean; purpose: "DINE_IN" | "TAKEAWAY" }[];
};

export async function listarMostradores(restauranteId: string): Promise<MostradorAdmin[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, qr_codes(active, purpose)")
    .eq("restaurant_id", restauranteId)
    .eq("active", true)
    .order("name")
    .overrideTypes<FilaLocal[], { merge: false }>();

  if (error) {
    console.error("listarMostradores", error.code);
    throw new Error("No se pudieron cargar los mostradores");
  }

  return data.map((fila) => ({
    localId: fila.id,
    local: fila.name,
    tieneQrActivo: fila.qr_codes.some((qr) => qr.active && qr.purpose === "TAKEAWAY"),
  }));
}

// Anula el QR de mostrador activo del local (si hay uno).
export async function desactivarQrMostrador(
  restauranteId: string,
  localId: string,
): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("qr_codes")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("branch_id", localId)
    .eq("restaurant_id", restauranteId)
    .eq("purpose", "TAKEAWAY")
    .eq("active", true);

  if (error) console.error("desactivarQrMostrador", error.code);
  return !error;
}

export type ResultadoMostrador =
  | { ok: true; local: string }
  | { ok: false; motivo: "LOCAL_NO_DISPONIBLE" | "ERROR" };

// Genera o regenera: primero anula el QR viejo y luego guarda el hash del nuevo.
// La base solo permite un QR de mostrador activo por local.
export async function reemplazarQrMostrador(
  restauranteId: string,
  localId: string,
  tokenHash: string,
): Promise<ResultadoMostrador> {
  const supabase = await crearClienteServidor();
  const { data: local, error } = await supabase
    .from("branches")
    .select("id, name, active")
    .eq("id", localId)
    .eq("restaurant_id", restauranteId)
    .maybeSingle();

  if (error) {
    console.error("reemplazarQrMostrador", error.code);
    return { ok: false, motivo: "ERROR" };
  }
  if (!local || !local.active) return { ok: false, motivo: "LOCAL_NO_DISPONIBLE" };

  if (!(await desactivarQrMostrador(restauranteId, localId))) {
    return { ok: false, motivo: "ERROR" };
  }

  const { error: errorInsert } = await supabase.from("qr_codes").insert({
    restaurant_id: restauranteId,
    branch_id: local.id,
    dining_table_id: null,
    purpose: "TAKEAWAY",
    token_hash: tokenHash,
  });

  if (errorInsert) {
    console.error("reemplazarQrMostrador", errorInsert.code);
    return { ok: false, motivo: "ERROR" };
  }
  return { ok: true, local: local.name };
}
