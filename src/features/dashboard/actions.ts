"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerResumenVentas } from "./ventas";
import {
  obtenerTendencias,
  type ResumenTendencias,
} from "./tendencias";
import {
  validarRango,
  type ResumenVentas,
} from "./ventas-logica";

export type ResultadoVentas =
  | { ok: true; resumen: ResumenVentas }
  | { ok: false; mensaje: string };

export async function consultarVentasAction(
  desde: string,
  hasta: string,
): Promise<ResultadoVentas> {
  // Fuera del try: conservamos las redirecciones de acceso.
  const sesion = await requerirRol(["OWNER", "ADMIN"]);

  const membresia = sesion.membresias.find((m) => m.rol === "OWNER")
    ?? sesion.membresias.find((m) => m.rol === "ADMIN");

  if (!membresia) {
    return {
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    };
  }

  const errorRango = validarRango(desde, hasta);

  if (errorRango) {
    return { ok: false, mensaje: errorRango };
  }

  try {
    const resumen = await obtenerResumenVentas(
      membresia.restaurantId,
      desde,
      hasta,
    );

    return { ok: true, resumen };
  } catch {
    return {
      ok: false,
      mensaje: "No se pudieron consultar las ventas. Intenta de nuevo.",
    };
  }
}

export type ResultadoTendencias =
  | { ok: true; tendencias: ResumenTendencias }
  | { ok: false; mensaje: string };

export async function consultarTendenciasAction(
  desde: string,
  hasta: string,
): Promise<ResultadoTendencias> {
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

  const errorRango = validarRango(desde, hasta);

  if (errorRango) {
    return { ok: false, mensaje: errorRango };
  }

  try {
    const tendencias = await obtenerTendencias(
      membresia.restaurantId,
      desde,
      hasta,
    );

    return { ok: true, tendencias };
  } catch {
    return {
      ok: false,
      mensaje: "No se pudieron consultar las tendencias. Intenta de nuevo.",
    };
  }
}
