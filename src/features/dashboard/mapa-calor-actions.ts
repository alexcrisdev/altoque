"use server";

import { requerirRol } from "../auth/sesion";
import {
  obtenerMapaCalor,
  type ResultadoMapa,
} from "./mapa-calor";
import {
  calcularMapaCalor,
  type FiltroMapa,
} from "./mapa-calor-logica";

export type RespuestaMapaCalor =
  | { ok: true; mapa: ResultadoMapa }
  | { ok: false; mensaje: string };

export async function consultarMapaCalorAction(
  filtro: FiltroMapa,
): Promise<RespuestaMapaCalor> {
  // Fuera del try para conservar las redirecciones de acceso.
  const sesion = await requerirRol(["OWNER", "ADMIN"]);

  const membresia = sesion.membresias.find(
    (m) => m.rol === "OWNER" || m.rol === "ADMIN",
  );

  if (!membresia) {
    return {
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    };
  }

  try {
    // Reutilizamos la validación pura antes de consultar.
    calcularMapaCalor([], filtro);
  } catch {
    return {
      ok: false,
      mensaje: "Revisa las fechas, el horario y el plato seleccionado.",
    };
  }

  try {
    const mapa = await obtenerMapaCalor(
      membresia.restaurantId,
      filtro,
    );

    return { ok: true, mapa };
  } catch {
    return {
      ok: false,
      mensaje: "No se pudo consultar el mapa de calor. Intenta de nuevo.",
    };
  }
}