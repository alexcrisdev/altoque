// US-153: convierte textos en vectores (embeddings) con el modelo gte-small que viene DENTRO de
// Supabase (gratis, sin claves de otros servicios). 384 números por texto, normalizados.
//
// Solo la llama el servidor de AlToque: exige el encabezado `x-altoque-secreto` igual al secreto
// EMBEBER_SECRETO (se configura con `supabase secrets set`). No guarda nada ni registra el texto.
//
// Recibe:  POST { "textos": ["...", "..."] }   (1 a 20 textos, cada uno de 1 a 1000 caracteres)
// Devuelve: { "vectores": [[...384 números...], ...] }   en el mismo orden.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_TEXTOS = 20;
const MAX_CARACTERES = 1000;
const LARGO_MINIMO_SECRETO = 32;

const sesion = new Supabase.ai.Session("gte-small");

function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}

// Compara en tiempo constante para no dar pistas del secreto.
function mismoSecreto(recibido: string, esperado: string): boolean {
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ error: "METHOD_NOT_ALLOWED" }, 405);

  const secreto = Deno.env.get("EMBEBER_SECRETO") ?? "";
  if (secreto.length < LARGO_MINIMO_SECRETO) return responder({ error: "NOT_CONFIGURED" }, 503);
  if (!mismoSecreto(req.headers.get("x-altoque-secreto") ?? "", secreto)) return responder({ error: "UNAUTHORIZED" }, 401);

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "INVALID_JSON" }, 400);
  }
  const textos = (cuerpo as { textos?: unknown } | null)?.textos;
  if (
    !Array.isArray(textos) || textos.length === 0 || textos.length > MAX_TEXTOS ||
    textos.some((t) => typeof t !== "string" || !t.trim() || t.length > MAX_CARACTERES)
  ) {
    return responder({ error: "INVALID_INPUT" }, 400);
  }

  try {
    const vectores: number[][] = [];
    // La documentación muestra un texto por llamada a session.run.
    for (const texto of textos as string[]) {
      const vector = await sesion.run(texto, { mean_pool: true, normalize: true });
      vectores.push(Array.from(vector as ArrayLike<number>));
    }
    return responder({ vectores });
  } catch {
    // Solo el tipo de error: nunca el texto recibido.
    console.error(JSON.stringify({ evento: "error", origen: "embeber", tipo: "modelo" }));
    return responder({ error: "EMBEDDING_FAILED" }, 500);
  }
});
