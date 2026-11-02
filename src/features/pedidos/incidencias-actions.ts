"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/features/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeErrorIncidencia, puedeGestionarIncidencias, validarIncidencia } from "./incidencias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function autorizado(pedidoId: string) {
  const sesion = await obtenerSesion();
  if (!sesion || !puedeGestionarIncidencias(sesion.membresias.map((m) => m.rol))) return false;
  return UUID.test(pedidoId);
}

export async function registrarIncidenciaAction(pedidoId: string, tipo: unknown, descripcion: unknown) {
  if (!await autorizado(pedidoId)) return { ok: false as const, mensaje: mensajeErrorIncidencia("FORBIDDEN") };
  const invalido = validarIncidencia(tipo, descripcion);
  if (invalido) return { ok: false as const, mensaje: invalido };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_incidencia", { p_pedido_id: pedidoId, p_tipo: tipo as string, p_descripcion: (descripcion as string).trim() });
  if (error) {
    const codigo = ["FORBIDDEN", "ORDER_NOT_FOUND", "INVALID_INCIDENT"].find((c) => error.message.includes(c));
    return { ok: false as const, mensaje: mensajeErrorIncidencia(codigo ?? "") };
  }
  revalidatePath(`/mesero/pedidos/${pedidoId}`); revalidatePath(`/admin/pedidos/${pedidoId}`);
  revalidatePath("/cocina");
  return { ok: true as const };
}

export async function resolverIncidenciaAction(pedidoId: string, incidenciaId: string) {
  if (!await autorizado(pedidoId) || !UUID.test(incidenciaId)) return { ok: false as const, mensaje: mensajeErrorIncidencia("FORBIDDEN") };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("resolver_incidencia", { p_incidencia_id: incidenciaId });
  if (error) {
    const codigo = ["FORBIDDEN", "ORDER_NOT_FOUND", "ALREADY_RESOLVED"].find((c) => error.message.includes(c));
    return { ok: false as const, mensaje: mensajeErrorIncidencia(codigo ?? "") };
  }
  revalidatePath(`/mesero/pedidos/${pedidoId}`); revalidatePath(`/admin/pedidos/${pedidoId}`);
  revalidatePath("/cocina");
  return { ok: true as const };
}
