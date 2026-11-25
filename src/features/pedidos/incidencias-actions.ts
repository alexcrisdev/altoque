"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "@/features/auth/sesion";
import { registrarAccesoDenegado } from "@/features/auth/registro-accesos";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  mensajeErrorIncidencia,
  puedeGestionarIncidencias,
  puedeGestionarTipoIncidencia,
  validarIncidencia,
  type TipoIncidencia,
} from "./incidencias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// US-106: solo mesero y cocina; la base revisa además qué tipo puede tocar cada uno.
async function rolesAutorizados(pedidoId: string) {
  const sesion = await obtenerSesion();
  const roles = sesion?.membresias.map((m) => m.rol) ?? [];
  if (sesion && !puedeGestionarIncidencias(roles)) await registrarAccesoDenegado(roles);
  if (!puedeGestionarIncidencias(roles) || !UUID.test(pedidoId)) return null;
  return roles;
}

export async function registrarIncidenciaAction(pedidoId: string, tipo: unknown, descripcion: unknown) {
  const roles = await rolesAutorizados(pedidoId);
  if (!roles) return { ok: false as const, mensaje: mensajeErrorIncidencia("FORBIDDEN") };
  const invalido = validarIncidencia(tipo, descripcion);
  if (invalido) return { ok: false as const, mensaje: invalido };
  if (!puedeGestionarTipoIncidencia(roles, tipo as TipoIncidencia)) {
    await registrarAccesoDenegado(roles);
    return { ok: false as const, mensaje: mensajeErrorIncidencia("FORBIDDEN") };
  }
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
  if (!await rolesAutorizados(pedidoId) || !UUID.test(incidenciaId)) return { ok: false as const, mensaje: mensajeErrorIncidencia("FORBIDDEN") };
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
