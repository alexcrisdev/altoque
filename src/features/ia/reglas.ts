// US-151: reglas comunes de la IA (sin secretos, sin llamar a nadie). Las usan claude.ts y
// las pruebas. Cambia aquí el modelo, los límites o los mensajes para todo el equipo.

/** Modelo para todas las HU: Claude Haiku 5.5 (el más barato). Cambiarlo aquí lo cambia en todas. */
export const MODELO_IA = "claude-haiku-5-5";

/** Esfuerzo por defecto: "low" gasta menos. Una HU puede pedir "medium" o "high" si lo necesita. */
export type EsfuerzoIA = "low" | "medium" | "high";
export const ESFUERZO_POR_DEFECTO: EsfuerzoIA = "low";

/** Tope de tokens de respuesta si la HU no dice otro (1 token ≈ 3/4 de palabra). */
export const MAX_TOKENS_POR_DEFECTO = 1024;
export const MAX_TOKENS_TOPE = 4096;

/** Cliente de la API: espera máxima por consulta y reintentos (un timeout también se reintenta). */
export const TIMEOUT_MS = 20_000;
export const REINTENTOS = 1;

/** Protege el saldo (US$ 10): fáciles de cambiar. */
export const LIMITE_POR_USUARIO_HORA = 30;
export const LIMITE_POR_RESTAURANTE_DIA = 300;

/** Texto máximo que se manda en una consulta (suma de instrucciones y mensajes). ≈ 3 500 tokens.
 * US-153: subió de 8000 a 12000 porque Toqui del admin suma instrucciones, foto o fragmentos y chat. */
export const MAX_CARACTERES = 12000;

export const MENSAJE_NO_DISPONIBLE = "IA no disponible por ahora";
export const MENSAJE_LIMITE = "Toqui descansa un rato, intenta más tarde";
export const MENSAJE_MUY_LARGO = "El texto es muy largo, resúmelo un poco.";

/** Respuesta fija del modo simulado (CI, pruebas y quien no tiene clave). */
export const RESPUESTA_SIMULADA = "Respuesta simulada de Toqui (modo prueba: no se llamó a Claude).";

// ── Tipos que usan las HU ──────────────────────────────────────────────────────────────

/** Un mensaje de la conversación. El último siempre es del usuario (Haiku 5.5 no acepta "prefill"). */
export type MensajeIA = { rol: "usuario" | "asistente"; texto: string };

/**
 * Para el límite de uso y el registro. `funcion` es un código corto de la HU (ej. "resumen-dashboard").
 * `usuarioId` es null para el cliente sin cuenta: entonces solo cuenta el límite del restaurante.
 */
export type UsoIA = { restauranteId: string; usuarioId: string | null; funcion: string };

export type TokensIA = { entrada: number; salida: number };

export type RespuestaIA =
  | { ok: true; texto: string; tokens: TokensIA; simulada: boolean }
  | { ok: false; motivo: string };

// ── Modo simulado ──────────────────────────────────────────────────────────────────────

/** Sin clave o con IA_SIMULADA=1 no se llama a Claude. Recibe el entorno para poder probarlo. */
export function esModoSimulado(entorno: Record<string, string | undefined>): boolean {
  return entorno.IA_SIMULADA === "1" || !entorno.ANTHROPIC_API_KEY?.trim();
}

// ── Límite de uso ──────────────────────────────────────────────────────────────────────

export type ResultadoCupo = "OK" | "LIMITE_USUARIO" | "LIMITE_RESTAURANTE";

/** Decide con los conteos ya hechos (consultas de la última hora del usuario y de hoy del restaurante). */
export function decidirCupo(conteo: { usuarioHora: number; restauranteDia: number }): ResultadoCupo {
  if (conteo.restauranteDia >= LIMITE_POR_RESTAURANTE_DIA) return "LIMITE_RESTAURANTE";
  if (conteo.usuarioHora >= LIMITE_POR_USUARIO_HORA) return "LIMITE_USUARIO";
  return "OK";
}

/** Código de HU válido para el registro: minúsculas, números y guiones (igual que en la base). */
export const FUNCION_VALIDA = /^[a-z0-9-]{1,40}$/;

// ── Datos personales ───────────────────────────────────────────────────────────────────

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Teléfonos: celular peruano (9 dígitos que empiezan con 9, con o sin +51), fijo con código
// entre paréntesis y cualquier número internacional que empiece con «+». No toca precios
// (S/ 25.50), cantidades (620 ml) ni números de pedido cortos.
const TELEFONOS = [
  /\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,4}\d{2,4}/g,
  /(?<!\d)(?:51[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g,
  /\(0?\d{1,2}\)[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)/g,
];

/**
 * Quita correos y teléfonos de un texto antes de mandarlo a Claude (reseñas, captura de Yape…).
 * Los cambia por [correo] y [teléfono] para que la frase siga entendiéndose.
 */
export function quitarDatosPersonales(texto: string): string {
  let limpio = texto.replace(CORREO, "[correo]");
  for (const patron of TELEFONOS) limpio = limpio.replace(patron, "[teléfono]");
  return limpio;
}
