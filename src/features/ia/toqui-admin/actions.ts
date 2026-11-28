"use server";

import { obtenerSesion } from "../../auth/sesion";
import { preguntarAClaude } from "../claude";
import { esModoSimulado, MENSAJE_NO_DISPONIBLE, type MensajeIA, type RespuestaIA } from "../reglas";
import { embeberTextos } from "../vectorial/embeber";
import { buscarFragmentos, indexarComentariosPendientes } from "../vectorial/fragmentos";
import {
  armarMensajeConFragmentos, CANTIDAD_FRAGMENTOS, elegirFuente, filtrarFragmentos, MAX_CARACTERES_FRAGMENTO, respuestaSinFragmentos,
  SIMILITUD_MINIMA, type FuenteIA,
} from "../vectorial/reglas";
import { obtenerFotoMetricas } from "./foto";
import { INSTRUCCIONES_TOQUI_ADMIN } from "./instrucciones";
import { armarMensajes, armarMensajesCon, MAX_TOKENS_TOQUI_ADMIN, MENSAJE_SIN_PERMISO, ultimosMensajes } from "./mensajes-logica";

// US-152: Toqui del administrador (métricas). US-153: también opiniones y manual (base vectorial).
// Una sola llamada a Claude por pregunta.

export type RespuestaToquiAdmin = RespuestaIA | { ok: false; codigo: "FORBIDDEN"; motivo: string };

const RESPUESTA_SIMULADA_BASE = "Respuesta simulada de Toqui (modo prueba: no se buscó en la base vectorial ni se llamó a Claude).";

export async function preguntarAToquiAdmin(mensajes: MensajeIA[]): Promise<RespuestaToquiAdmin> {
  // Restaurante y rol salen de la SESIÓN, nunca del navegador. Sin OWNER o ADMIN no se llama a Claude.
  const sesion = await obtenerSesion();
  const membresia = sesion?.membresias.find((m) => m.rol === "OWNER")
    ?? sesion?.membresias.find((m) => m.rol === "ADMIN");
  if (!sesion || !membresia) return { ok: false, codigo: "FORBIDDEN", motivo: MENSAJE_SIN_PERMISO };

  const historial = ultimosMensajes(mensajes);
  const pregunta = historial.at(-1);
  if (pregunta?.rol !== "usuario") return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };

  const uso = { restauranteId: membresia.restaurantId, usuarioId: sesion.usuario.id };
  const fuente = elegirFuente(pregunta.texto);
  if (fuente !== "METRICAS") return responderConBaseVectorial(historial, fuente, uso);

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
    uso: { ...uso, funcion: "toqui-admin" },
  });
}

// US-153 (RAG): 1) indexa los comentarios nuevos, 2) convierte la pregunta en vector,
// 3) busca los fragmentos más parecidos de ESTE restaurante y 4) Claude responde solo con ellos.
async function responderConBaseVectorial(
  historial: MensajeIA[],
  fuente: FuenteIA,
  uso: { restauranteId: string; usuarioId: string },
): Promise<RespuestaToquiAdmin> {
  const funcion = fuente === "REVIEW" ? "toqui-opiniones" : "toqui-manual";

  // Pruebas y CI: sin base vectorial ni Claude (respuesta simulada fija).
  if (esModoSimulado(process.env)) {
    return preguntarAClaude({
      instrucciones: INSTRUCCIONES_TOQUI_ADMIN, mensajes: historial, uso: { ...uso, funcion },
      respuestaSimulada: RESPUESTA_SIMULADA_BASE,
    });
  }

  const pregunta = historial.at(-1)!.texto;
  if (fuente === "REVIEW") {
    try {
      await indexarComentariosPendientes(uso.restauranteId); // los comentarios nuevos entran solos
    } catch {
      console.error(JSON.stringify({ evento: "error", origen: "toqui-opiniones", tipo: "indexar" }));
    }
  }

  const vectores = await embeberTextos([pregunta.slice(0, MAX_CARACTERES_FRAGMENTO)]);
  if (!vectores) return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };

  let fragmentos;
  try {
    fragmentos = filtrarFragmentos(
      await buscarFragmentos(uso.restauranteId, fuente, vectores[0], CANTIDAD_FRAGMENTOS, SIMILITUD_MINIMA[fuente]),
      fuente,
    );
  } catch {
    return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
  }
  // Registro sin texto: cuántos fragmentos y qué tan parecidos (para ajustar la similitud mínima).
  console.info(JSON.stringify({
    evento: "ia-busqueda", fuente, encontrados: fragmentos.length,
    similitudMaxima: fragmentos[0]?.similitud ?? null, similitudMinima: fragmentos.at(-1)?.similitud ?? null,
  }));

  // Sin fragmentos parecidos no se llama a Claude: nunca se inventan comentarios ni pasos.
  if (fragmentos.length === 0) {
    return { ok: true, texto: respuestaSinFragmentos(fuente), tokens: { entrada: 0, salida: 0 }, simulada: false };
  }

  return preguntarAClaude({
    instrucciones: INSTRUCCIONES_TOQUI_ADMIN,
    mensajes: armarMensajesCon(historial, (texto) => armarMensajeConFragmentos(texto, fuente, fragmentos)),
    maxTokens: MAX_TOKENS_TOQUI_ADMIN,
    esfuerzo: "low",
    uso: { ...uso, funcion },
  });
}
