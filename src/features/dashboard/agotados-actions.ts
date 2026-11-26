"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerAgotadosRecientes, type PlatoAgotado } from "./agotados";

export type ResultadoAgotados =
  | { ok: true; platos: PlatoAgotado[] }
  | { ok: false; mensaje: string };

// US-146: platos agotados recientes para la pantalla de stock.
export async function consultarAgotadosRecientesAction(): Promise<ResultadoAgotados> {
  // Fuera del try para conservar las redirecciones de autenticación y acceso.
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find(fila => fila.rol === "OWNER")
    ?? sesion.membresias.find(fila => fila.rol === "ADMIN");
  if (!membresia) return { ok: false, mensaje: "No se pudo identificar el restaurante autorizado." };

  try {
    return { ok: true, platos: await obtenerAgotadosRecientes(membresia.restaurantId) };
  } catch {
    return { ok: false, mensaje: "No se pudieron consultar los platos agotados. Intenta de nuevo." };
  }
}
