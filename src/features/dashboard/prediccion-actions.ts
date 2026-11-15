"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerPrediccionManana, type ResumenPrediccion } from "./prediccion";

export type ResultadoPrediccion =
  | { ok: true; resumen: ResumenPrediccion }
  | { ok: false; mensaje: string };

export async function consultarPrediccionMananaAction(): Promise<ResultadoPrediccion> {
  // Fuera del try para conservar las redirecciones de autenticación y acceso.
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find(fila => fila.rol === "OWNER")
    ?? sesion.membresias.find(fila => fila.rol === "ADMIN");
  if (!membresia) return { ok: false, mensaje: "No se pudo identificar el restaurante autorizado." };

  try {
    return { ok: true, resumen: await obtenerPrediccionManana(membresia.restaurantId) };
  } catch {
    return { ok: false, mensaje: "No se pudo consultar la predicción para mañana. Intenta de nuevo." };
  }
}
