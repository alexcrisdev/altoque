import "server-only";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import type { ResultadoComprobante } from "./comprobante-logica";

export async function guardarResultadoComprobante(dato: ResultadoComprobante): Promise<"ok" | "conflicto" | "error"> {
  const { error } = await crearClienteAdmin().rpc("actualizar_boleta_prueba", {
    p_pago_id: dato.pago_id, p_serie: dato.serie, p_numero: dato.numero,
    p_estado: dato.estado, p_pdf: dato.enlace_pdf, p_xml: dato.enlace_xml,
  });
  if (!error) return "ok";
  return /RECEIPT_(NOT_FOUND|CONFLICT)|INVALID_RECEIPT/.test(error.message) ? "conflicto" : "error";
}
