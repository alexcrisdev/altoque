import "server-only";
import { timingSafeEqual } from "node:crypto";
import { limpiarArchivosHuerfanos, limpiarCapturas } from "./capturas";

export async function ejecutarLimpiezaCapturas(autorizacion: string | null) {
  const secreto = process.env.CAPTURAS_CRON_SECRET;
  if (!secreto || secreto.length < 32) return { estado: 503, cuerpo: { error: "Limpieza no configurada" } };
  const recibido = Buffer.from(autorizacion ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return { estado: 401, cuerpo: { error: "No autorizado" } };
  }
  try {
    const eliminadas = await limpiarCapturas();
    const huerfanas = await limpiarArchivosHuerfanos();
    return { estado: 200, cuerpo: { eliminadas, huerfanas } };
  }
  catch { return { estado: 500, cuerpo: { error: "Limpieza pendiente de reintento" } }; }
}
