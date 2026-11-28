import "server-only";
import { mlValidos, porcentajeAlcoholValido } from "../../carta/bebidas-alcohol";
import { ALERGENOS_COMUNES, normalizar, textoBusqueda, type DatosBebida } from "./reglas";

// US-156: Open Food Facts (base pública y gratuita de productos envasados). Solo se le manda
// el nombre de la bebida: nada del restaurante ni de personas. En pruebas siempre se simula.
//
// Dos pasos (la búsqueda antigua /cgi/search.pl es «legacy» y responde 503 seguido):
//   1. Search-a-licious: busca por nombre y da el código de barras.
//   2. API v2 de producto: con el código trae % de alcohol y alérgenos.
// Límites de Open Food Facts: 10 búsquedas y 15 fichas por minuto por IP.

export const URL_BUSQUEDA = "https://search.openfoodfacts.org/search";
export const URL_PRODUCTO = "https://world.openfoodfacts.org/api/v2/product/";
export const USER_AGENT = "AlToque/1.0 (proyecto universitario)";
export const TIMEOUT_OPEN_FOOD_FACTS_MS = 5_000; // para los dos pasos juntos
const CAMPOS_BUSQUEDA = "code,product_name,quantity,product_quantity,product_quantity_unit";
const CAMPOS_PRODUCTO = "product_name,quantity,product_quantity,product_quantity_unit,nutriments,allergens_tags";
const CODIGO = /^\d{6,14}$/;

// Etiquetas de Open Food Facts → nombre en la carta.
const ALERGENOS_OFF: Record<string, (typeof ALERGENOS_COMUNES)[number]> = {
  "en:gluten": "Gluten", "en:crustaceans": "Crustáceos", "en:eggs": "Huevo", "en:fish": "Pescado",
  "en:peanuts": "Maní", "en:soybeans": "Soya", "en:milk": "Lácteos", "en:nuts": "Frutos secos",
  "en:celery": "Apio", "en:mustard": "Mostaza", "en:sesame-seeds": "Sésamo",
  "en:sulphur-dioxide-and-sulphites": "Sulfitos", "en:lupin": "Altramuces", "en:molluscs": "Moluscos",
};

type ProductoOFF = {
  code?: unknown;
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

/** Del resultado de la búsqueda (`hits`), el primer producto cuyo nombre se parece al buscado. */
export function elegirProducto(json: unknown, buscado: string): ProductoOFF | null {
  const lista = (json as { hits?: unknown; products?: unknown } | null)?.hits ?? (json as { products?: unknown } | null)?.products;
  if (!Array.isArray(lista)) return null;
  const palabras = textoBusqueda(buscado).split(" ").filter((p) => p.length >= 3);
  return (lista as ProductoOFF[]).find((p) => {
    const nombre = typeof p?.product_name === "string" ? normalizar(p.product_name) : "";
    return nombre && palabras.some((palabra) => nombre.includes(palabra));
  }) ?? null;
}

/** Deja validados los datos de un producto de Open Food Facts. */
export function leerProducto(producto: ProductoOFF): DatosBebida {
  const alcohol = Number(producto.nutriments?.alcohol_100g ?? producto.nutriments?.alcohol);
  const redondeado = Math.round(alcohol * 10) / 10;
  const porcentajeAlcohol = Number.isFinite(alcohol) && porcentajeAlcoholValido(redondeado) ? redondeado : null;
  const etiquetas = Array.isArray(producto.allergens_tags) ? producto.allergens_tags : [];
  const alergenos = [...new Set(etiquetas.flatMap((e) => (typeof e === "string" && ALERGENOS_OFF[e] ? [ALERGENOS_OFF[e]] : [])))];
  const nombre = typeof producto.product_name === "string" ? producto.product_name.trim().slice(0, 80) || null : null;
  return { nombre, ml: mlDeProducto(producto), porcentajeAlcohol, alergenos };
}

/** Busca la bebida en Open Food Facts. Si tarda más de 5 s, falla o no la encuentra: null. */
export async function buscarBebidaOpenFoodFacts(nombre: string, buscar: typeof fetch = fetch): Promise<DatosBebida | null> {
  const consulta = textoBusqueda(nombre);
  if (consulta.length < 2) return null;
  const opciones: RequestInit = {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_OPEN_FOOD_FACTS_MS),
    cache: "no-store",
  };
  try {
    const urlBusqueda = new URL(URL_BUSQUEDA);
    urlBusqueda.search = new URLSearchParams({ q: consulta, page_size: "5", fields: CAMPOS_BUSQUEDA }).toString();
    const busqueda = await buscar(urlBusqueda, opciones);
    if (!busqueda.ok) return null;
    const elegido = elegirProducto(await busqueda.json(), nombre);
    if (!elegido) return null;

    // Paso 2: la ficha completa (alcohol y alérgenos). Si falla, sirve lo que trajo la búsqueda.
    let ficha: ProductoOFF = elegido;
    if (typeof elegido.code === "string" && CODIGO.test(elegido.code)) {
      const urlProducto = new URL(`${URL_PRODUCTO}${elegido.code}`);
      urlProducto.search = new URLSearchParams({ fields: CAMPOS_PRODUCTO }).toString();
      const respuesta = await buscar(urlProducto, opciones).catch(() => null);
      const json = respuesta?.ok ? ((await respuesta.json()) as { status?: unknown; product?: ProductoOFF }) : null;
      if (json?.status === 1 && json.product) ficha = { ...elegido, ...json.product };
    }
    return leerProducto(ficha);
  } catch {
    console.error(JSON.stringify({ evento: "error", origen: "open-food-facts", tipo: "sin-respuesta" }));
    return null;
  }
}
