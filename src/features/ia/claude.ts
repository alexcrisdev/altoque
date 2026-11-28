import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ESFUERZO_POR_DEFECTO, FUNCION_VALIDA, MAX_CARACTERES, MAX_TOKENS_POR_DEFECTO, MAX_TOKENS_TOPE,
  MENSAJE_LIMITE, MENSAJE_MUY_LARGO, MENSAJE_NO_DISPONIBLE, MODELO_IA, REINTENTOS, RESPUESTA_SIMULADA,
  TIMEOUT_MS, esModoSimulado, quitarDatosPersonales,
  type EsfuerzoIA, type MensajeIA, type RespuestaIA, type TokensIA, type UsoIA,
} from "./reglas";
import { anotarTokens, reservarConsulta } from "./uso";

// US-151: la ÚNICA puerta a Claude para todas las HU. Solo corre en el servidor: la clave
// (ANTHROPIC_API_KEY) nunca llega al navegador. Nunca lanza errores: siempre devuelve
// { ok: true, texto, tokens } o { ok: false, motivo } con un mensaje listo para la pantalla.

export type PreguntaIA = {
  /** Instrucciones fijas de la HU (rol, tono, reglas). Van en caché para abaratar. */
  instrucciones: string;
  /** Conversación; el último mensaje siempre es del usuario. */
  mensajes: MensajeIA[];
  /** Tope de tokens de la respuesta (por defecto 1024, máximo 4096). */
  maxTokens?: number;
  /** Quién pregunta y para qué HU: para el límite de uso. */
  uso: UsoIA;
  /** "low" por defecto (más barato). Sube a "medium" solo si la respuesta sale floja. */
  esfuerzo?: EsfuerzoIA;
};

type EventoIA = { evento: "ia"; funcion: string; modelo: string; resultado: string; tokens: TokensIA | null };

// Solo datos técnicos: nunca la clave, el texto del cliente ni datos personales.
function registrar(evento: Omit<EventoIA, "evento" | "modelo">) {
  const linea: EventoIA = { evento: "ia", modelo: MODELO_IA, ...evento };
  if (evento.resultado === "ok" || evento.resultado === "simulada") console.info(JSON.stringify(linea));
  else console.error(JSON.stringify(linea));
}

/** Nombre corto del error según las clases del SDK (más específica primero). */
export function tipoDeError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "sin-conexion";
  if (error instanceof Anthropic.AuthenticationError) return "clave-invalida";
  if (error instanceof Anthropic.PermissionDeniedError) return "sin-permiso";
  if (error instanceof Anthropic.RateLimitError) return "limite-api";
  if (error instanceof Anthropic.BadRequestError) return "peticion-invalida";
  if (error instanceof Anthropic.APIError) return `api-${error.status ?? "desconocido"}`;
  return "desconocido";
}

function entradaValida(pregunta: PreguntaIA): boolean {
  const { mensajes, uso } = pregunta;
  return (
    typeof pregunta.instrucciones === "string" &&
    Array.isArray(mensajes) && mensajes.length > 0 &&
    mensajes.every((m) => (m.rol === "usuario" || m.rol === "asistente") && typeof m.texto === "string" && m.texto.trim() !== "") &&
    mensajes[0].rol === "usuario" &&
    mensajes[mensajes.length - 1].rol === "usuario" && // sin "prefill": Haiku 5.5 respondería 400
    typeof uso?.restauranteId === "string" && FUNCION_VALIDA.test(uso.funcion ?? "")
  );
}

export async function preguntarAClaude(pregunta: PreguntaIA): Promise<RespuestaIA> {
  const funcion = FUNCION_VALIDA.test(pregunta?.uso?.funcion ?? "") ? pregunta.uso.funcion : "desconocida";

  if (!entradaValida(pregunta)) {
    registrar({ funcion, resultado: "entrada-invalida", tokens: null });
    return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
  }

  // Modo simulado: CI, pruebas y quien no tiene clave. No llama a Claude ni a la base.
  if (esModoSimulado(process.env)) {
    registrar({ funcion, resultado: "simulada", tokens: null });
    return { ok: true, texto: RESPUESTA_SIMULADA, tokens: { entrada: 0, salida: 0 }, simulada: true };
  }

  // Sin datos personales: se quitan correos y teléfonos de lo que escribe el usuario.
  const mensajes: Anthropic.MessageParam[] = pregunta.mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "assistant",
    content: m.rol === "usuario" ? quitarDatosPersonales(m.texto) : m.texto,
  }));
  const caracteres = pregunta.instrucciones.length + pregunta.mensajes.reduce((s, m) => s + m.texto.length, 0);
  if (caracteres > MAX_CARACTERES) {
    registrar({ funcion, resultado: "muy-largo", tokens: null });
    return { ok: false, motivo: MENSAJE_MUY_LARGO };
  }

  let usoId: number | null = null;
  try {
    const cupo = await reservarConsulta(pregunta.uso);
    if (cupo.resultado !== "OK") {
      registrar({ funcion, resultado: cupo.resultado === "LIMITE_USUARIO" ? "limite-usuario" : "limite-restaurante", tokens: null });
      return { ok: false, motivo: MENSAJE_LIMITE };
    }
    usoId = cupo.usoId;
  } catch {
    // Si no se puede contar, no se gasta: mejor sin IA que sin control del saldo.
    registrar({ funcion, resultado: "error-limite", tokens: null });
    return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
  }

  const maxTokens = Math.min(Math.max(Math.floor(pregunta.maxTokens ?? MAX_TOKENS_POR_DEFECTO), 1), MAX_TOKENS_TOPE);

  try {
    const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: REINTENTOS });
    // Reglas de Haiku 5.5: sin temperature/top_p/top_k, sin prefill y sin budget_tokens.
    const respuesta = await cliente.messages.create({
      model: MODELO_IA,
      max_tokens: maxTokens,
      system: [{ type: "text", text: pregunta.instrucciones, cache_control: { type: "ephemeral" } }],
      messages: mensajes,
      output_config: { effort: pregunta.esfuerzo ?? ESFUERZO_POR_DEFECTO },
    });

    const u = respuesta.usage;
    const tokens: TokensIA = {
      entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      salida: u.output_tokens,
    };
    if (usoId !== null) await anotarTokens(usoId, tokens).catch(() => undefined); // no frena la respuesta

    const texto = respuesta.content
      .flatMap((bloque) => (bloque.type === "text" ? [bloque.text] : []))
      .join("")
      .trim();
    if (respuesta.stop_reason === "refusal" || !texto) {
      registrar({ funcion, resultado: respuesta.stop_reason === "refusal" ? "rechazo" : "sin-texto", tokens });
      return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
    }
    registrar({ funcion, resultado: "ok", tokens });
    return { ok: true, texto, tokens, simulada: false };
  } catch (error) {
    registrar({ funcion, resultado: tipoDeError(error), tokens: null });
    return { ok: false, motivo: MENSAJE_NO_DISPONIBLE };
  }
}
