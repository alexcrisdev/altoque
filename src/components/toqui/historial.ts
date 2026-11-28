// US-151: tipos del chat de Toqui y cómo se arma la conversación que va a la IA (sin React).

/** Mensaje del chat. Es el mismo formato que MensajeIA de src/features/ia/reglas.ts. */
export type MensajeToqui = { rol: "usuario" | "asistente"; texto: string };
/** Lo que devuelve la acción de servidor. RespuestaIA (preguntarAClaude) encaja tal cual. */
export type RespuestaToqui = { ok: true; texto: string } | { ok: false; motivo: string };

/** Línea del chat: lo que escribe el usuario, lo que responde Toqui o un aviso (límite, error). */
export type Linea = { de: "usuario" | "asistente" | "aviso"; texto: string };

/** Mensajes que se mandan a la IA: menos historial = menos tokens. */
export const HISTORIAL_MAXIMO = 10;

/** Conversación para la IA: sin avisos, los últimos mensajes y empezando por el usuario. */
export function historialParaIA(lineas: Linea[], maximo = HISTORIAL_MAXIMO): MensajeToqui[] {
  const mensajes = lineas
    .filter((l): l is Linea & { de: MensajeToqui["rol"] } => l.de !== "aviso")
    .map((l) => ({ rol: l.de, texto: l.texto }))
    .slice(-maximo);
  while (mensajes.length > 0 && mensajes[0].rol !== "usuario") mensajes.shift();
  return mensajes;
}
