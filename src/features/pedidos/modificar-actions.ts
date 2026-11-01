"use server";

import { revalidatePath } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { calcularNuevoTotalCentimos, mensajeErrorModificacion, puedeModificar, requiereMotivoModificacion, validarCambios, type CambioPedido } from "./modificacion";
import { obtenerDetallePedido } from "./pedidos-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codigos = ["ORDER_NOT_FOUND", "INVALID_STATE", "FORBIDDEN", "REASON_REQUIRED", "INVALID_CHANGES", "ORDER_EMPTY"];

export async function modificarPedido(pedidoId: string, cambios: CambioPedido[], motivo?: string): Promise<{ ok: true; mensaje: string; totalCentimos: number } | { ok: false; mensaje: string }> {
  const rolesPermitidos = ["WAITER", "OWNER", "ADMIN"] as const;
  let sesion;
  try {
    sesion = await requerirRol(rolesPermitidos);
  } catch {
    return { ok: false, mensaje: mensajeErrorModificacion("FORBIDDEN") };
  }
  if (!UUID.test(pedidoId)) return { ok: false, mensaje: "El identificador del pedido no es válido." };
  const restauranteIds = [...new Set(sesion.membresias.filter((m) => rolesPermitidos.includes(m.rol as typeof rolesPermitidos[number])).map((m) => m.restaurantId))];
  const supabase = await crearClienteServidor();

  // Cada consulta queda acotada a un restaurante de la sesión; el RPC vuelve a autorizarlo bajo bloqueo.
  let detalle = null;
  let restaurantePedido = "";
  for (const restauranteId of restauranteIds) {
    detalle = await obtenerDetallePedido(restauranteId, pedidoId);
    if (detalle) { restaurantePedido = restauranteId; break; }
  }
  if (!detalle) {
    const { error } = await supabase.rpc("modificar_pedido", {
      p_pedido_id: pedidoId,
      p_cambios: Array.isArray(cambios) ? cambios as never : [] as never,
      p_motivo: motivo?.trim() || null,
    });
    const codigo = error && codigos.find((c) => error.message.includes(c));
    return { ok: false, mensaje: mensajeErrorModificacion(codigo ?? "ORDER_NOT_FOUND") };
  }
  const roles = sesion.membresias.filter((m) => m.restaurantId === restaurantePedido && rolesPermitidos.includes(m.rol as typeof rolesPermitidos[number])).map((m) => m.rol);
  if (!roles.some((rol) => rolesPermitidos.includes(rol as typeof rolesPermitidos[number]))) return { ok: false, mensaje: mensajeErrorModificacion("FORBIDDEN") };
  if (detalle.estado === "READY" || detalle.estado === "DELIVERED" || detalle.estado === "CANCELLED") return { ok: false, mensaje: mensajeErrorModificacion("INVALID_STATE") };
  if (!puedeModificar(detalle.estado, roles)) return { ok: false, mensaje: mensajeErrorModificacion("FORBIDDEN") };
  if (requiereMotivoModificacion(detalle.estado) && !motivo?.trim()) return { ok: false, mensaje: mensajeErrorModificacion("REASON_REQUIRED") };
  const validacion = validarCambios(detalle.items, cambios);
  if (!validacion.ok) return { ok: false, mensaje: mensajeErrorModificacion(validacion.codigo) };

  const { error } = await supabase.rpc("modificar_pedido", {
    p_pedido_id: pedidoId,
    p_cambios: cambios as never,
    p_motivo: motivo?.trim() || null,
  });
  if (error) {
    const codigo = codigos.find((c) => error.message.includes(c));
    return { ok: false, mensaje: mensajeErrorModificacion(codigo ?? "") };
  }
  revalidatePath("/cocina");
  revalidatePath("/mesero");
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  revalidatePath(`/mesero/pedidos/${pedidoId}`);
  return { ok: true, mensaje: "Pedido modificado.", totalCentimos: calcularNuevoTotalCentimos(detalle.items, cambios) };
}
