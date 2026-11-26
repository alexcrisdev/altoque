"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "../auth/sesion";
import { registrarAccesoDenegado } from "../auth/registro-accesos";
import { esUuid } from "../mesero/solicitud-asistida";
import { marcarDevolucionRealizada } from "./devoluciones";
import { mensajeErrorDevolucion, puedeMarcarDevolucion } from "./devoluciones-logica";

// US-105: caja, dueño o admin marcan que el dinero ya se devolvió. La base guarda quién y cuándo.
export async function marcarDevolucionAction(devolucionId: unknown): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const sesion = await obtenerSesion();
  const roles = sesion?.membresias.map((m) => m.rol) ?? [];
  if (!sesion || !puedeMarcarDevolucion(roles)) {
    if (sesion) await registrarAccesoDenegado(roles);
    return { ok: false, mensaje: mensajeErrorDevolucion("FORBIDDEN") };
  }
  if (!esUuid(devolucionId)) return { ok: false, mensaje: mensajeErrorDevolucion("REFUND_NOT_FOUND") };
  const resultado = await marcarDevolucionRealizada(devolucionId);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorDevolucion(resultado.codigo) };
  revalidatePath("/caja");
  revalidatePath("/admin/pedidos", "layout");
  return { ok: true };
}
