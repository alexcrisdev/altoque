// US-153: carga el manual de uso (docs/manual/*.md) en la base vectorial de Toqui.
//   npm run ia:indexar-manual -- --dry-run   → solo cuenta las secciones (no llama a nadie)
//   npm run ia:indexar-manual                → calcula los vectores y los guarda (base de .env.local)
// Cada sección «## Título» es un fragmento. Las secciones que ya no existen se borran.
// Necesita la migración US-153 aplicada y la Edge Function «embeber» desplegada.
// Nunca muestra claves. Nunca corre en CI.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CARPETA_MANUAL = "docs/manual";
const MAX_CARACTERES = 1000;
const POR_LOTE = 20;

const slug = (texto) => texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Secciones «## Título» de un Markdown: { id: "manual:titulo", titulo, contenido }. */
export function seccionesDelManual(markdown) {
  const secciones = [];
  let actual = null;
  for (const linea of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const titulo = linea.match(/^##\s+(.+?)\s*$/);
    if (titulo) {
      actual = { id: `manual:${slug(titulo[1])}`, titulo: titulo[1], lineas: [] };
      secciones.push(actual);
    } else if (actual && linea.trim()) {
      actual.lineas.push(linea.trim());
    }
  }
  return secciones
    .filter((s) => s.lineas.length > 0)
    .map((s) => ({ id: s.id, titulo: s.titulo, contenido: `${s.titulo}\n${s.lineas.join("\n")}`.slice(0, MAX_CARACTERES) }));
}

export function leerManual(carpeta = CARPETA_MANUAL) {
  const archivos = readdirSync(carpeta).filter((a) => a.endsWith(".md")).sort();
  const secciones = archivos.flatMap((a) => seccionesDelManual(readFileSync(join(carpeta, a), "utf8")));
  const ids = secciones.map((s) => s.id);
  const repetido = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repetido) throw new Error(`Sección repetida en el manual: ${repetido}`);
  return secciones;
}

async function llamar(url, opciones, que) {
  const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(20_000) });
  if (!respuesta.ok) throw new Error(`${que} respondió HTTP ${respuesta.status}.`);
  return respuesta.json();
}

async function main() {
  const soloContar = process.argv.includes("--dry-run");
  const secciones = leerManual();
  console.log(`Manual: ${secciones.length} secciones.`);
  for (const s of secciones) console.log(`  - ${s.id} (${s.contenido.length} caracteres)`);
  if (soloContar) {
    console.log("Dry-run: no se calculó ni guardó nada.");
    return;
  }
  if (process.env.CI) throw new Error("No se ejecuta en CI.");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secreto = process.env.EMBEBER_SECRETO;
  if (!base || !servicio || !secreto) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o EMBEBER_SECRETO en .env.local.");
  }
  const rest = { apikey: servicio, Authorization: `Bearer ${servicio}`, "Content-Type": "application/json" };

  let guardados = 0;
  for (let i = 0; i < secciones.length; i += POR_LOTE) {
    const lote = secciones.slice(i, i + POR_LOTE);
    const { vectores } = await llamar(`${base}/functions/v1/embeber`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-altoque-secreto": secreto },
      body: JSON.stringify({ textos: lote.map((s) => s.contenido) }),
    }, "La función embeber");
    if (!Array.isArray(vectores) || vectores.length !== lote.length) throw new Error("La función embeber devolvió vectores inválidos.");
    guardados += await llamar(`${base}/rest/v1/rpc/guardar_fragmentos_ia`, {
      method: "POST",
      headers: rest,
      body: JSON.stringify({
        p_fragmentos: lote.map((s, j) => ({
          restaurant_id: null, source: "MANUAL", source_id: s.id, content: s.contenido,
          service_stars: null, waiter_stars: null, source_date: null, embedding: `[${vectores[j].join(",")}]`,
        })),
      }),
    }, "guardar_fragmentos_ia");
  }
  const borrados = await llamar(`${base}/rest/v1/rpc/podar_manual_ia`, {
    method: "POST", headers: rest, body: JSON.stringify({ p_vigentes: secciones.map((s) => s.id) }),
  }, "podar_manual_ia");
  console.log(`Listo: ${guardados} secciones guardadas, ${borrados} secciones viejas borradas.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`No se pudo indexar el manual: ${error instanceof Error ? error.message : "error"}`);
    process.exit(1);
  });
}
