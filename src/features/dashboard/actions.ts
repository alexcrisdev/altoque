"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerResumenVentas } from "./ventas";
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
