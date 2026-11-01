"use server";

import { requerirRol } from "../auth/sesion";
import { listarPedidosCocina, obtenerEstadoActualCocina } from "./pedidos-cocina";

const ROLES_COCINA = ["KITCHEN", "OWNER", "ADMIN"] as const;

// El restaurante procede de la sesión del personal, nunca de parámetros del navegador.
export async function obtenerPanelCocina(pedidoId?: string) {
  const sesion = await requerirRol(ROLES_COCINA);
  const membresia = sesion.membresias.find((m) => ROLES_COCINA.some((rol) => rol === m.rol));
  if (!membresia) throw new Error("No se encontró un restaurante disponible.");

  try {
    if (pedidoId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pedidoId)) {
      throw new Error("El identificador del pedido no es válido.");
    }
    const pedidos = await listarPedidosCocina(membresia.restaurantId);
    const estadoPedido = pedidoId === undefined ? undefined : await obtenerEstadoActualCocina(membresia.restaurantId, pedidoId);
    return { ok: true as const, restauranteId: membresia.restaurantId, pedidos, estadoPedido, actualizadoEn: new Date().toISOString() };
  } catch {
    return { ok: false as const, restauranteId: membresia.restaurantId };
  }
}
