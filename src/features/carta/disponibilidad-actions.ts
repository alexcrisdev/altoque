"use server";

import { resolverAccesoQr } from "../acceso-qr/acceso";
import { obtenerDisponibilidad } from "./carta";
import type { DisponibilidadProducto } from "./tipos";

export type ResultadoDisponibilidad =
  | { ok: true; productos: DisponibilidadProducto[] }
  | { ok: false };

// US-103: la carta pregunta por el stock con el mismo token QR que ya usa.
// El restaurante se resuelve en el servidor; el navegador nunca elige cuál.
// No se abren permisos RLS para anónimos: la consulta va por el cliente admin.
export async function consultarDisponibilidadAction(
  token: unknown,
): Promise<ResultadoDisponibilidad> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) {
    return { ok: false };
  }

  try {
    const acceso = await resolverAccesoQr(token);
    if (acceso.estado !== "VALIDO") return { ok: false };
    return { ok: true, productos: await obtenerDisponibilidad(acceso.restauranteId) };
  } catch {
    return { ok: false };
  }
}
