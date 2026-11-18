"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerActividadDia, type ActividadDia } from "./actividad";
import { fechasHoyAyer } from "./panel-vivo-logica";

export type ResultadoActividad = { ok: true; actividad: ActividadDia } | { ok: false; mensaje: string };

// US-099 (Parte 2b): solo OWNER/ADMIN, lectura con su sesión (RLS).
export async function consultarActividadDiaAction(): Promise<ResultadoActividad> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((fila) => fila.rol === "OWNER")
    ?? sesion.membresias.find((fila) => fila.rol === "ADMIN");
  if (!membresia) return { ok: false, mensaje: "No se pudo identificar el restaurante autorizado." };
  try {
    const { hoy } = fechasHoyAyer(Date.now());
    return { ok: true, actividad: await obtenerActividadDia(membresia.restaurantId, hoy) };
  } catch {
    return { ok: false, mensaje: "No se pudo cargar la actividad del día." };
  }
}
