// US-153: base vectorial (RAG) de Toqui. Lógica pura, sin base ni internet: se prueba sola.
//
// Flujo (para explicarlo):
//   1. Los comentarios de clientes y el manual se limpian y se convierten en vectores (gte-small).
//   2. La pregunta del dueño también se convierte en vector.
//   3. La base devuelve los fragmentos más PARECIDOS EN SIGNIFICADO (coseno), solo de su restaurante.
//   4. Claude responde usando SOLO esos fragmentos.
import { quitarDatosPersonales } from "../reglas";

export type FuenteIA = "REVIEW" | "MANUAL";
export type FuentePregunta = FuenteIA | "METRICAS";

export const DIMENSIONES = 384;
export const MAX_TEXTOS_EMBEBER = 20;
export const MAX_CARACTERES_FRAGMENTO = 1000;
export const COMENTARIOS_POR_VEZ = 50;
/**
 * Qué fragmentos se mandan a Claude (similitud de 0 a 1). Calibrado con la prueba real (28/11/2026):
 * con gte-small en español todas las secciones del manual salen entre 0.79 y 0.85, y la correcta
 * sale primera con 0.87 a 0.93; una pregunta que el manual no cubre llega a 0.825 como mucho.
 * - Manual: mínimo 0.84, solo las que están a 0.06 o menos de la mejor, máximo 3.
 * - Opiniones: mínimo 0.70 y hasta 12 (Claude las agrupa por tema y descarta las que no tratan del tema).
 */
export const CANTIDAD_FRAGMENTOS = 12; // cuántos pide a la base (el máximo de las dos fuentes)
export const SIMILITUD_MINIMA: Record<FuenteIA, number> = { REVIEW: 0.7, MANUAL: 0.84 };
export const MARGEN_DESDE_EL_MEJOR: Record<FuenteIA, number> = { REVIEW: 1, MANUAL: 0.06 };
export const MAX_FRAGMENTOS: Record<FuenteIA, number> = { REVIEW: 12, MANUAL: 3 };

export const SIN_COMENTARIOS = "Aún no tengo comentarios sobre eso.";
export const SIN_MANUAL = "No encuentro eso en el manual.";

const normalizar = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();

// ── 1. ¿De dónde sale la respuesta? (simple y barato: sin llamar a la IA) ──────────────

const OPINIONES = /\b(quej\w*|comentari\w*|opin\w*|resen\w*|calificacion\w*|critic\w*|reclam\w*|dicen|piensan|valoracion\w*|feedback)\b/;
const METRICA = /\b(vend\w*|venta\w*|gan\w*|ticket|pico|agot\w*|predic\w*|cancel\w*|ingreso\w*|factur\w*)\b/;
const MANUAL_COMO = /\bcomo\s+(se\s+\w+|(lo|la|los|las|le)\s+\w+|(hago|genero|creo|agrego|anado|registro|cambio|edito|borro|elimino|uso|puedo|configuro|cierro|cobro|abro|imprimo|descargo|activo|desactivo|habilito|marco|subo|pongo|veo|verifico|asigno|muevo|organizo|doy|pido|confirmo|libero|reviso|bajo|saco))\b/;
const MANUAL_OTRAS = /\b(que\s+(es|son|significa)\s|para\s+que\s+sirve|donde\s+(esta|estan|veo|encuentro|se)\b|pasos?\b|manual\b|instruccion\w*|ensen\w*)/;

/** Opiniones → REVIEW; «cómo hago…» o «qué es…» de AlToque → MANUAL; si no → solo métricas. */
export function elegirFuente(pregunta: string): FuentePregunta {
  const p = normalizar(pregunta);
  if (OPINIONES.test(p)) return "REVIEW";
  // «¿Cómo se vendió el lomo?» es una métrica, no una instrucción.
  if (MANUAL_COMO.test(p) && !(/\bcomo\s+se\s/.test(p) && METRICA.test(p))) return "MANUAL";
  if (MANUAL_OTRAS.test(p) && !METRICA.test(p)) return "MANUAL";
  return "METRICAS";
}

// ── 2. Limpiar un comentario antes de guardarlo ────────────────────────────────────────

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tapa los nombres dados (personal del restaurante y cliente del pedido) como [nombre]. */
export function quitarNombres(texto: string, nombres: readonly string[]): string {
  const palabras = [...new Set(nombres.flatMap((n) => n.split(/\s+/)).map((p) => p.trim()).filter((p) => p.length >= 3))];
  let limpio = texto;
  for (const palabra of palabras) {
    const sinTilde = palabra.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const variante of new Set([palabra, sinTilde])) {
      limpio = limpio.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapar(variante)}(?![\\p{L}\\p{N}])`, "giu"), "[nombre]");
    }
  }
  return limpio;
}

/** Comentario listo para indexar: sin correos, teléfonos ni nombres; null si queda vacío. */
export function limpiarComentario(texto: string, nombres: readonly string[] = []): string | null {
  const limpio = quitarNombres(quitarDatosPersonales(texto), nombres).replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, MAX_CARACTERES_FRAGMENTO) : null;
}

// ── 3. El mensaje que va a Claude ──────────────────────────────────────────────────────

export type FragmentoEncontrado = {
  id: string;
  source_id: string;
  content: string;
  service_stars: number | null;
  waiter_stars: number | null;
  source_date: string | null;
  similitud: number;
};

/** «2026-11-20» → «20/11/2026». */
const fecha = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "sin fecha");

export function armarMensajeConFragmentos(pregunta: string, fuente: FuenteIA, fragmentos: readonly FragmentoEncontrado[]): string {
  if (fuente === "REVIEW") {
    const lista = fragmentos.map((f, i) => {
      const estrellas = [f.service_stars ? `servicio ${f.service_stars}★` : null, f.waiter_stars ? `mesero ${f.waiter_stars}★` : null]
        .filter(Boolean).join(" · ");
      return `[${i + 1}] (${fecha(f.source_date)}${estrellas ? ` · ${estrellas}` : ""}) "${f.content}"`;
    });
    return `COMENTARIOS DE CLIENTES (${fragmentos.length}, los más parecidos a la pregunta; ya sin datos personales):\n${lista.join("\n")}\n\nPREGUNTA: ${pregunta}`;
  }
  const secciones = fragmentos.map((f) => `[${f.source_id}]\n${f.content}`);
  return `MANUAL DE ALTOQUE (secciones más parecidas a la pregunta):\n${secciones.join("\n\n")}\n\nPREGUNTA: ${pregunta}`;
}

/** Deja solo los fragmentos que valen la pena (vienen ordenados de más a menos parecido). */
export function filtrarFragmentos<T extends { similitud: number }>(fragmentos: readonly T[], fuente: FuenteIA): T[] {
  const mejor = fragmentos[0]?.similitud ?? 0;
  return fragmentos
    .filter((f) => f.similitud >= SIMILITUD_MINIMA[fuente] && f.similitud >= mejor - MARGEN_DESDE_EL_MEJOR[fuente])
    .slice(0, MAX_FRAGMENTOS[fuente]);
}

/** Respuesta fija cuando no hay fragmentos parecidos: no se llama a Claude ni se inventa nada. */
export function respuestaSinFragmentos(fuente: FuenteIA): string {
  return fuente === "REVIEW" ? SIN_COMENTARIOS : SIN_MANUAL;
}

/** Vector en el formato que entiende pgvector: "[0.1,0.2,...]". */
export function vectorATexto(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

/** Valida que sea un vector de 384 números. */
export function esVectorValido(vector: unknown): vector is number[] {
  return Array.isArray(vector) && vector.length === DIMENSIONES && vector.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Vector falso fijo para pruebas y CI (nunca se llama a Supabase). */
export const VECTOR_SIMULADO: readonly number[] = Object.freeze(Array.from({ length: DIMENSIONES }, () => 1 / Math.sqrt(DIMENSIONES)));
