import "server-only";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { crearClienteServidor } from "../../lib/supabase/server";

export type SolicitudAyuda = {
  id: string;
  mesaNumero: number | null;
  creadaEn: string;
};

type FilaSolicitud = {
  id: string;
  created_at: string;
  dining_tables: { number: number } | null;
};

type ResultadoAyuda = { ok: true } | { ok: false; codigo: string };

export async function listarSolicitudesAbiertas(restauranteId: string): Promise<SolicitudAyuda[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("help_requests")
    .select("id, created_at, dining_tables(number)")
    .eq("restaurant_id", restauranteId)
    .eq("status", "OPEN")
    .order("created_at", { ascending: true })
    .overrideTypes<FilaSolicitud[], { merge: false }>();
  if (error) {
    console.error("listarSolicitudesAbiertas", error.code);
    throw new Error("No se pudieron cargar las solicitudes de ayuda.");
  }
  return (data ?? []).map((fila) => ({
    id: fila.id,
    mesaNumero: fila.dining_tables?.number ?? null,
    creadaEn: fila.created_at,
  }));
}

export async function solicitarAyuda(qrId: string): Promise<ResultadoAyuda> {
  const supabase = crearClienteAdmin();
  const { data, error } = await supabase.rpc("solicitar_ayuda", { p_qr_code_id: qrId });
  if (!error && typeof data === "string") return { ok: true };
  if (error) console.error("solicitarAyuda", error.code);
  return { ok: false, codigo: error?.message.includes("TABLE_NOT_OPEN") ? "TABLE_NOT_OPEN"
    : error?.message.includes("QR_UNAVAILABLE") ? "QR_UNAVAILABLE" : "ERROR" };
}

export async function atenderSolicitud(id: string): Promise<ResultadoAyuda> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("atender_solicitud_ayuda", { p_solicitud_id: id });
  if (!error) return { ok: true };
  console.error("atenderSolicitud", error.code);
  const codigo = ["ALREADY_ATTENDED", "FORBIDDEN", "REQUEST_NOT_FOUND"].find((valor) => error.message.includes(valor));
  return { ok: false, codigo: codigo ?? "ERROR" };
}
