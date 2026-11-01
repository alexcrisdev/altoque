"use server";

import { requerirRol } from "../auth/sesion";
import { listarPedidosCocina } from "./pedidos-cocina";

const ROLES_COCINA = ["KITCHEN", "OWNER", "ADMIN"] as const;

// El restaurante procede de la sesión del personal, nunca de parámetros del navegador.
export async function obtenerPanelCocina() {
  const sesion = await requerirRol(ROLES_COCINA);
  const membresia = sesion.membresias.find((m) => ROLES_COCINA.some((rol) => rol === m.rol));
  if (!membresia) throw new Error("No se encontró un restaurante disponible.");

  try {
    const pedidos = await listarPedidosCocina(membresia.restaurantId);
    return { ok: true as const, restauranteId: membresia.restaurantId, pedidos, actualizadoEn: new Date().toISOString() };
  } catch {
    return { ok: false as const, restauranteId: membresia.restaurantId };
  }
}
