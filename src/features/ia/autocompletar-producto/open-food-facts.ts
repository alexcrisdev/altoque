import "server-only";
import { mlValidos, porcentajeAlcoholValido } from "../../carta/bebidas-alcohol";
import { ALERGENOS_COMUNES, normalizar, textoBusqueda, type DatosBebida } from "./reglas";

// US-156: Open Food Facts (base pública y gratuita de productos envasados). Solo se le manda
// el nombre de la bebida: nada del restaurante ni de personas. En pruebas siempre se simula.

export const URL_OPEN_FOOD_FACTS = "https://world.openfoodfacts.org/cgi/search.pl";
export const USER_AGENT = "AlToque/1.0 (proyecto universitario)";
export const TIMEOUT_OPEN_FOOD_FACTS_MS = 5_000;
const CAMPOS = "product_name,quantity,product_quantity,product_quantity_unit,nutriments,allergens_tags";

// Etiquetas de Open Food Facts → nombre en la carta.
const ALERGENOS_OFF: Record<string, (typeof ALERGENOS_COMUNES)[number]> = {
  "en:gluten": "Gluten", "en:crustaceans": "Crustáceos", "en:eggs": "Huevo", "en:fish": "Pescado",
  "en:peanuts": "Maní", "en:soybeans": "Soya", "en:milk": "Lácteos", "en:nuts": "Frutos secos",
  "en:celery": "Apio", "en:mustard": "Mostaza", "en:sesame-seeds": "Sésamo",
  "en:sulphur-dioxide-and-sulphites": "Sulfitos", "en:lupin": "Altramuces", "en:molluscs": "Moluscos",
};

type ProductoOFF = {
  product_name?: unknown;
  quantity?: unknown;
  product_quantity?: unknown;
  product_quantity_unit?: unknown;
  nutriments?: Record<string, unknown> | null;
  allergens_tags?: unknown;
};

function mlDeProducto(p: ProductoOFF): number | null {
  const unidad = typeof p.product_quantity_unit === "string" ? p.product_quantity_unit.toLowerCase() : "";
  const cantidad = Number(p.product_quantity);
  let ml: number | null = null;
  if (Number.isFinite(cantidad) && cantidad > 0 && ["ml", "cl", "l"].includes(unidad)) {
    ml = cantidad * (unidad === "ml" ? 1 : unidad === "cl" ? 10 : 1000);
  } else if (typeof p.quantity === "string") {
    const m = p.quantity.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/);
    if (m) ml = Number(m[1]) * (m[2] === "ml" ? 1 : m[2] === "cl" ? 10 : 1000);
  }
  ml = ml === null ? null : Math.round(ml);
  return ml !== null && mlValidos(ml) ? ml : null;
}

/** Elige el primer producto cuyo nombre se parece al buscado y lo deja validado. */
export function leerRespuestaOpenFoodFacts(json: unknown, buscado: string): DatosBebida | null {
  const productos = (json as { products?: unknown } | null)?.products;
  if (!Array.isArray(productos)) return null;
  const palabras = textoBusqueda(buscado).split(" ").filter((p) => p.length >= 3);
  const producto = (productos as ProductoOFF[]).find((p) => {
    const nombre = typeof p?.product_name === "string" ? normalizar(p.product_name) : "";
    return nombre && palabras.some((palabra) => nombre.includes(palabra));
  });
  if (!producto) return null;

  const alcohol = Number(producto.nutriments?.alcohol_100g ?? producto.nutriments?.alcohol);
  const porcentajeAlcohol = Number.isFinite(alcohol) && porcentajeAlcoholValido(Math.round(alcohol * 10) / 10)
    ? Math.round(alcohol * 10) / 10 : null;
  const etiquetas = Array.isArray(producto.allergens_tags) ? producto.allergens_tags : [];
  const alergenos = [...new Set(etiquetas.flatMap((e) => (typeof e === "string" && ALERGENOS_OFF[e] ? [ALERGENOS_OFF[e]] : [])))];
  const nombre = typeof producto.product_name === "string" ? producto.product_name.trim().slice(0, 80) || null : null;
  return { nombre, ml: mlDeProducto(producto), porcentajeAlcohol, alergenos };
}

/** Busca la bebida en Open Food Facts. Si tarda más de 5 s, falla o no la encuentra: null. */
export async function buscarBebidaOpenFoodFacts(nombre: string, buscar: typeof fetch = fetch): Promise<DatosBebida | null> {
  const consulta = textoBusqueda(nombre);
  if (consulta.length < 2) return null;
  const url = new URL(URL_OPEN_FOOD_FACTS);
  url.search = new URLSearchParams({
    search_terms: consulta, search_simple: "1", action: "process", json: "1", page_size: "5", fields: CAMPOS,
  }).toString();
  try {
    const respuesta = await buscar(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_OPEN_FOOD_FACTS_MS),
      cache: "no-store",
    });
    if (!respuesta.ok) return null;
    return leerRespuestaOpenFoodFacts(await respuesta.json(), nombre);
  } catch {
    console.error(JSON.stringify({ evento: "error", origen: "open-food-facts", tipo: "sin-respuesta" }));
    return null;
  }
}
