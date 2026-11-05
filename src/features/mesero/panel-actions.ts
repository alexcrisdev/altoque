"use server";

import { requerirRol } from "../auth/sesion";
import { listarMesasConSesion } from "./sesiones";
import { listarPedidosActivos } from "./pedidos-activos";
import { listarSolicitudesAbiertas } from "./ayuda";

// El navegador no elige el restaurante: procede de la membresía autorizada.
export async function obtenerPanelMesero() {
  const roles = ["WAITER", "OWNER", "ADMIN"] as const;
  const sesion = await requerirRol(roles);
  const membresia = sesion.membresias.find((m) => roles.some((rol) => rol === m.rol));
  if (!membresia) throw new Error("No se encontró un restaurante disponible.");
  try {
    const [mesas, pedidos] = await Promise.all([
      listarMesasConSesion(membresia.restaurantId),
      listarPedidosActivos(membresia.restaurantId),
    ]);
    // Una falla de ayuda no debe ocultar las mesas ni los pedidos.
    const solicitudes = await listarSolicitudesAbiertas(membresia.restaurantId).catch(() => null);
    return { ok: true as const, restauranteId: membresia.restaurantId, mesas, pedidos,
      solicitudes, errorSolicitudes: solicitudes === null, actualizadoEn: new Date().toISOString() };
  } catch {
    return { ok: false as const, restauranteId: membresia.restaurantId };
  }
}
