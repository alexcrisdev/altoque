"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerSesion } from "@/features/auth/sesion";
import type { Rol } from "@/features/auth/permisos";
import { mensajeErrorEstado, type EstadoPedido } from "./estados";

const estados: EstadoPedido[] = ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];
const codigos = ["ORDER_NOT_FOUND", "INVALID_TRANSITION", "FORBIDDEN", "REASON_REQUIRED", "INVALID_REASON"];

export async function cambiarEstadoPedido(
  pedidoId: string,
  nuevoEstado: EstadoPedido,
  motivo?: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (!sesion || !sesion.membresias.length) return { ok: false, mensaje: mensajeErrorEstado("FORBIDDEN") };
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId) || !estados.includes(nuevoEstado)) {
    return { ok: false, mensaje: "Los datos del pedido no son válidos." };
  }
  const rolesNecesarios: Record<EstadoPedido, Rol[]> = {
    PENDING: [],
    ACCEPTED: ["KITCHEN", "OWNER", "ADMIN"],
    IN_PROGRESS: ["KITCHEN", "OWNER", "ADMIN"],
    READY: ["KITCHEN", "OWNER", "ADMIN"],
    DELIVERED: ["WAITER", "OWNER", "ADMIN"],
    CANCELLED: ["WAITER", "OWNER", "ADMIN"],
  };
  const rolesUsuario = sesion.membresias.map((m) => m.rol);
  if (!rolesNecesarios[nuevoEstado].some((rol) => rolesUsuario.includes(rol))) {
    return { ok: false, mensaje: mensajeErrorEstado("FORBIDDEN") };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_pedido", {
    p_pedido_id: pedidoId,
    p_estado: nuevoEstado,
    p_motivo: motivo?.trim() || null,
  });
  if (error) {
    const codigo = codigos.find((c) => error.message.includes(c));
    return { ok: false, mensaje: mensajeErrorEstado(codigo ?? "") };
  }

  revalidatePath("/cocina");
  revalidatePath("/mesero");
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  return { ok: true };
}
