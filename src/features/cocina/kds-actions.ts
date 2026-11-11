"use server";

import { requerirRol } from "../auth/sesion";
import { cambiarEstadoPedido } from "../pedidos/estado-actions";
import { listarPedidosCocina } from "./pedidos-cocina";
import { puedeDeshacerListo } from "./cocina-logica";

async function restauranteCocina() {
  const roles = ["KITCHEN", "OWNER", "ADMIN"] as const;
  const sesion = await requerirRol(roles);
  const membresia = sesion.membresias.find((m) => roles.some((rol) => rol === m.rol));
  if (!membresia) throw new Error("Sin acceso a cocina.");
  return membresia.restaurantId;
}

export async function obtenerKds() {
  const restauranteId = await restauranteCocina();
  try {
    const actualizadoEn = Date.now();
    return { ok: true as const, restauranteId, actualizadoEn, pedidos: await listarPedidosCocina(restauranteId, actualizadoEn) };
  } catch {
    return { ok: false as const, restauranteId };
  }
}

export async function cambiarEstadoKds(pedidoId: string, deshacer = false) {
  const restauranteId = await restauranteCocina();
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return { ok: false as const, mensaje: "Pedido inválido." };
  try {
    const pedidos = await listarPedidosCocina(restauranteId, Date.now());
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido || pedido.estado !== (deshacer ? "READY" : "IN_PROGRESS")) {
      return { ok: false as const, mensaje: "El pedido cambió de estado. Actualizamos la pantalla." };
    }
    if (deshacer && !puedeDeshacerListo(pedido.listoEn, Date.now())) {
      return { ok: false as const, mensaje: "Pasaron los cinco minutos para deshacer. El pedido sigue listo." };
    }
    // Conserva la validación de transición y restaurante de la función SQL de US-069.
    return await cambiarEstadoPedido(pedidoId, deshacer ? "IN_PROGRESS" : "READY");
  } catch {
    return { ok: false as const, mensaje: "No pudimos guardar. Revisa tu conexión e inténtalo de nuevo." };
  }
}
