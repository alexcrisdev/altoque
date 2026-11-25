"use server";

import { requerirRol } from "../auth/sesion";
import { listarMesasConSesion } from "./sesiones";
import { listarPedidosActivos } from "./pedidos-activos";
import { listarSolicitudesAbiertas } from "./ayuda";
import { estadosLiberacionMesas } from "../pago-cierre/cuentas";
import type { EstadoLiberacion } from "./liberacion-logica";

// El navegador no elige el restaurante: procede de la membresía autorizada.
export async function obtenerPanelMesero() {
  const roles = ["WAITER"] as const; // US-106
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
    // US-106: solo "Lista para liberar" o "Falta pagar en caja", sin montos. Si falla, no se muestra.
    const sesionesAbiertas = mesas.flatMap((mesa) => mesa.sesion ? [mesa.sesion.id] : []);
    const liberacion: Record<string, EstadoLiberacion> = await estadosLiberacionMesas(membresia.restaurantId, sesionesAbiertas)
      .then((estados) => Object.fromEntries(estados)).catch(() => ({}));
    return { ok: true as const, restauranteId: membresia.restaurantId, mesas, pedidos,
      solicitudes, errorSolicitudes: solicitudes === null, liberacion, actualizadoEn: new Date().toISOString() };
  } catch {
    return { ok: false as const, restauranteId: membresia.restaurantId };
  }
}
