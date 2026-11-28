"use server";

import { obtenerSesion } from "../../auth/sesion";
import { preguntarAClaude } from "../claude";
import { MENSAJE_NO_DISPONIBLE, type MensajeIA, type RespuestaIA } from "../reglas";
import { obtenerFotoMetricas } from "./foto";
import { INSTRUCCIONES_TOQUI_ADMIN } from "./instrucciones";
import { armarMensajes, MAX_TOKENS_TOQUI_ADMIN, MENSAJE_SIN_PERMISO, ultimosMensajes } from "./mensajes-logica";

// US-152: Toqui del administrador. Una sola llamada a Claude por pregunta.

export type RespuestaToquiAdmin = RespuestaIA | { ok: false; codigo: "FORBIDDEN"; motivo: string };

export async function preguntarAToquiAdmin(mensajes: MensajeIA[]): Promise<RespuestaToquiAdmin> {
  // Restaurante y rol salen de la SESIÓN, nunca del navegador. Sin OWNER o ADMIN no se llama a Claude.
  const sesion = await obtenerSesion();
  const membresia = sesion?.membresias.find((m) => m.rol === "OWNER")
    ?? sesion?.membresias.find((m) => m.rol === "ADMIN");
  if (!sesion || !membresia) return { ok: false, codigo: "FORBIDDEN", motivo: MENSAJE_SIN_PERMISO };

  const historial = ultimosMensajes(mensajes);
  if (historial.at(-1)?.rol !== "usuario") return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };

  let fotoJson: string;
  try {
    fotoJson = JSON.stringify(await obtenerFotoMetricas(membresia.restaurantId));
  } catch {
    return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
  }

  return preguntarAClaude({
    instrucciones: INSTRUCCIONES_TOQUI_ADMIN,
    mensajes: armarMensajes(historial, fotoJson),
    maxTokens: MAX_TOKENS_TOQUI_ADMIN,
    esfuerzo: "low",
    uso: { restauranteId: membresia.restaurantId, usuarioId: sesion.usuario.id, funcion: "toqui-admin" },
  });
}
