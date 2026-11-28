import "server-only";
import { esModoSimulado } from "../reglas";
import { esVectorValido, MAX_CARACTERES_FRAGMENTO, MAX_TEXTOS_EMBEBER, VECTOR_SIMULADO } from "./reglas";

// US-153: pide los vectores a la Edge Function «embeber» de Supabase (gte-small, gratis).
// Solo servidor: manda el secreto EMBEBER_SECRETO, que nunca llega al navegador.
// En pruebas y CI (modo simulado de la IA) NO llama a nadie: devuelve vectores falsos fijos.

export const TIMEOUT_EMBEBER_MS = 10_000;
export const LARGO_MINIMO_SECRETO = 32;

export function urlEmbeber(entorno: Record<string, string | undefined> = process.env): string | null {
  const base = entorno.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/functions/v1/embeber` : null;
}

/** Vectores de 384 números, uno por texto y en el mismo orden. null si algo falla (nunca lanza). */
export async function embeberTextos(textos: readonly string[], buscar: typeof fetch = fetch): Promise<number[][] | null> {
  const limpios = textos.map((t) => (typeof t === "string" ? t.trim() : ""));
  if (limpios.length === 0 || limpios.length > MAX_TEXTOS_EMBEBER || limpios.some((t) => !t || t.length > MAX_CARACTERES_FRAGMENTO)) {
    return null;
  }
  if (esModoSimulado(process.env)) return limpios.map(() => [...VECTOR_SIMULADO]);

  const secreto = process.env.EMBEBER_SECRETO?.trim() ?? "";
  const url = urlEmbeber();
  if (secreto.length < LARGO_MINIMO_SECRETO || !url) {
    console.error(JSON.stringify({ evento: "error", origen: "embeber", tipo: "sin-configurar" }));
    return null;
  }

  try {
    const respuesta = await buscar(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-altoque-secreto": secreto },
      body: JSON.stringify({ textos: limpios }),
      signal: AbortSignal.timeout(TIMEOUT_EMBEBER_MS),
      cache: "no-store",
    });
    if (!respuesta.ok) {
      console.error(JSON.stringify({ evento: "error", origen: "embeber", tipo: `http-${respuesta.status}` }));
      return null;
    }
    const { vectores } = (await respuesta.json()) as { vectores?: unknown };
    if (!Array.isArray(vectores) || vectores.length !== limpios.length || !vectores.every(esVectorValido)) {
      console.error(JSON.stringify({ evento: "error", origen: "embeber", tipo: "respuesta-invalida" }));
      return null;
    }
    return vectores;
  } catch (error) {
    const tipo = error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "sin-conexion";
    console.error(JSON.stringify({ evento: "error", origen: "embeber", tipo }));
    return null;
  }
}
