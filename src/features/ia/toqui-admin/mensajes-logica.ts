// US-152: cómo se arma la conversación que va a Claude (lógica pura, se prueba sin base).
import { MAX_CARACTERES, type MensajeIA } from "../reglas";
import { INSTRUCCIONES_TOQUI_ADMIN } from "./instrucciones";

export const MENSAJE_SIN_PERMISO = "Solo el dueño o el administrador pueden usar a Toqui.";
export const ULTIMOS_MENSAJES = 6;
export const MAX_TOKENS_TOQUI_ADMIN = 600;

/** Solo los últimos 6 mensajes, bien formados y empezando por el usuario (vienen del navegador). */
export function ultimosMensajes(mensajes: unknown): MensajeIA[] {
  if (!Array.isArray(mensajes)) return [];
  const limpios: MensajeIA[] = mensajes
    .filter((m): m is MensajeIA =>
      typeof m === "object" && m !== null &&
      (m.rol === "usuario" || m.rol === "asistente") && typeof m.texto === "string" && m.texto.trim() !== "")
    .map((m) => ({ rol: m.rol, texto: m.texto }))
    .slice(-ULTIMOS_MENSAJES);
  while (limpios.length > 0 && limpios[0].rol !== "usuario") limpios.shift();
  return limpios;
}

/**
 * Pega la foto de métricas a la última pregunta. Si todo no cabe en el tope de caracteres
 * de la base de IA, quita primero los mensajes más viejos (la pregunta actual siempre va).
 */
export function armarMensajes(mensajes: MensajeIA[], fotoJson: string): MensajeIA[] {
  return armarMensajesCon(mensajes, (pregunta) => `FOTO DE MÉTRICAS (calculada por la base):\n${fotoJson}\n\nPREGUNTA: ${pregunta}`);
}

/**
 * US-153: igual que armarMensajes, pero la última pregunta la arma quien llama (por ejemplo,
 * con los comentarios o el manual que encontró la base vectorial).
 */
export function armarMensajesCon(mensajes: MensajeIA[], construir: (pregunta: string) => string): MensajeIA[] {
  const pregunta = mensajes.at(-1);
  if (!pregunta || pregunta.rol !== "usuario") return [];
  const ultimo: MensajeIA = { rol: "usuario", texto: construir(pregunta.texto) };
  let anteriores = mensajes.slice(0, -1);
  const largo = () => INSTRUCCIONES_TOQUI_ADMIN.length + ultimo.texto.length + anteriores.reduce((s, m) => s + m.texto.length, 0);
  while (anteriores.length > 0 && largo() > MAX_CARACTERES) {
    anteriores = anteriores.slice(1);
    while (anteriores.length > 0 && anteriores[0].rol !== "usuario") anteriores = anteriores.slice(1);
  }
  return [...anteriores, ultimo];
}
