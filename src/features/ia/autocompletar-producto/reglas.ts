// US-156: reglas del «✨ Autocompletar» de productos (lógica pura, sin base ni internet).
import { CATALOGO_CATEGORIAS } from "../../carta/categorias-admin";
import { CATEGORIA_CON_ALCOHOL, mlValidos, porcentajeAlcoholValido } from "../../carta/bebidas-alcohol";

export const MENSAJE_NO_PUDE = "No pude autocompletar, llénalo a mano";
export const MENSAJE_NOMBRE = "Escribe un nombre de 2 a 80 caracteres para autocompletar.";
export const NOMBRE_MINIMO = 2;
export const NOMBRE_MAXIMO = 80;
export const DESCRIPCION_MAXIMA = 160;
export const INGREDIENTE_MAXIMO = 40;
export const INGREDIENTES_MAXIMOS = 12;

/** Las 10 categorías estándar (US-148), con su nombre exacto. */
export const CATEGORIAS_ESTANDAR = CATALOGO_CATEGORIAS.map((c) => c.nombre);
export type CategoriaEstandar = (typeof CATEGORIAS_ESTANDAR)[number];

/** Alérgenos comunes (los 14 de declaración obligatoria), con el nombre que ve el cliente. */
export const ALERGENOS_COMUNES = [
  "Gluten", "Crustáceos", "Huevo", "Pescado", "Maní", "Soya", "Lácteos",
  "Frutos secos", "Apio", "Mostaza", "Sésamo", "Sulfitos", "Altramuces", "Moluscos",
] as const;

// ── Esquema para la salida estructurada de Claude ──────────────────────────────────────
// Sin minimum/maximum ni maxLength (la API no los acepta): los rangos se validan abajo.
export const ESQUEMA_AUTOCOMPLETAR = {
  type: "object",
  properties: {
    categoria: { anyOf: [{ type: "string", enum: [...CATEGORIAS_ESTANDAR] }, { type: "null" }] },
    descripcion: { type: "string" },
    ingredientes: { type: "array", items: { type: "string" } },
    alergenosSugeridos: { type: "array", items: { type: "string", enum: [...ALERGENOS_COMUNES] } },
    esBebidaConAlcohol: { type: "boolean" },
    porcentajeAlcohol: { anyOf: [{ type: "number" }, { type: "null" }] },
    ml: { anyOf: [{ type: "integer" }, { type: "null" }] },
  },
  required: ["categoria", "descripcion", "ingredientes", "alergenosSugeridos", "esBebidaConAlcohol", "porcentajeAlcohol", "ml"],
  additionalProperties: false,
} as const;

/** Lo que devuelve el modo simulado (CI y E2E): un plato de prueba con todos los campos. */
export const RESPUESTA_SIMULADA_PRODUCTO = JSON.stringify({
  categoria: "Platos de fondo",
  descripcion: "Descripción de prueba (modo simulado, sin IA).",
  ingredientes: ["ingrediente de prueba"],
  alergenosSugeridos: ["Gluten"],
  esBebidaConAlcohol: false,
  porcentajeAlcohol: null,
  ml: null,
});

// ── Bebidas envasadas ──────────────────────────────────────────────────────────────────

export const normalizar = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.,]+/g, " ").trim();

const MARCAS_ENVASADAS = [
  "inca kola", "coca cola", "cocacola", "pepsi", "sprite", "fanta", "seven up", "7up", "guarana", "kola real",
  "big cola", "concordia", "crush", "pilsen", "cusquena", "cristal", "arequipena", "corona", "heineken",
  "brahma", "budweiser", "stella artois", "san mateo", "cielo", "san luis", "frugos", "gatorade",
  "powerade", "sporade", "red bull", "volt", "cifrut", "pulp", "free tea", "lipton",
];
const UNIDADES = /\b\d+(?:[.,]\d+)?\s?(?:ml|cl|l|lt|litros?)\b|\b(?:lata|botella|six ?pack|personal|descartable)\b/;

/** ¿El nombre parece una bebida envasada? (entonces se consulta Open Food Facts). */
export function pareceBebidaEnvasada(nombre: string): boolean {
  const n = normalizar(nombre);
  return UNIDADES.test(n) || MARCAS_ENVASADAS.some((marca) => n.includes(marca));
}

/** ml escritos en el nombre ("Cusqueña 620 ml", "Inca Kola 1.5 L"). null si no hay o no es válido. */
export function mlDelNombre(nombre: string): number | null {
  const m = normalizar(nombre).match(/\b(\d+(?:[.,]\d+)?)\s?(ml|cl|l|lt|litros?)\b/);
  if (!m) return null;
  const numero = Number(m[1].replace(",", "."));
  const factor = m[2] === "ml" ? 1 : m[2] === "cl" ? 10 : 1000;
  const ml = Math.round(numero * factor);
  return mlValidos(ml) ? ml : null;
}

/** Texto para buscar en Open Food Facts: el nombre sin la cantidad. */
export function textoBusqueda(nombre: string): string {
  return normalizar(nombre).replace(UNIDADES, " ").replace(/\s+/g, " ").trim();
}

// ── Validación de la respuesta ─────────────────────────────────────────────────────────

/** Datos que trajo Open Food Facts (ya validados). */
export type DatosBebida = { nombre: string | null; ml: number | null; porcentajeAlcohol: number | null; alergenos: string[] };

export type Sugerencia = {
  categoria: CategoriaEstandar | null;
  descripcion: string | null;
  ingredientes: string | null; // separados por comas, como el formulario
  alergenos: string[]; // SIEMPRE sugeridos: el dueño los confirma uno por uno
  porcentajeAlcohol: number | null;
  ml: number | null;
};

const PRECIO = /s\/\s*\d|\d+\s*soles\b|\bprecio\b/i;
const esTexto = (v: unknown): v is string => typeof v === "string";
const numeroValido = (v: unknown, ok: (n: number) => boolean) => (typeof v === "number" && ok(v) ? v : null);

function soloAlergenosComunes(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return ALERGENOS_COMUNES.filter((a) => lista.includes(a));
}

/**
 * Valida en el servidor lo que respondió Claude y lo junta con Open Food Facts y con los ml
 * del nombre. Un campo que no cuadra se descarta (null). Si no queda nada útil: null.
 */
export function validarSugerencia(
  json: unknown,
  extra: { bebida?: DatosBebida | null; mlNombre?: number | null } = {},
): Sugerencia | null {
  const r = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const bebida = extra.bebida ?? null;

  let categoria = CATEGORIAS_ESTANDAR.find((c) => c === r.categoria) ?? null;

  const textoDescripcion = esTexto(r.descripcion) ? r.descripcion.trim() : "";
  const descripcion = textoDescripcion && textoDescripcion.length <= DESCRIPCION_MAXIMA && !PRECIO.test(textoDescripcion)
    ? textoDescripcion : null;

  const ingredientesLista = Array.isArray(r.ingredientes)
    ? [...new Set(r.ingredientes.filter(esTexto).map((i) => i.trim()).filter((i) => i && i.length <= INGREDIENTE_MAXIMO))]
    : [];
  const ingredientes = ingredientesLista.length && ingredientesLista.length <= INGREDIENTES_MAXIMOS
    ? ingredientesLista.join(", ") : null;

  // Alérgenos: los de Open Food Facts (dato real) más los típicos que sugiere Claude.
  const alergenos = ALERGENOS_COMUNES.filter((a) => (bebida?.alergenos ?? []).includes(a) || soloAlergenosComunes(r.alergenosSugeridos).includes(a));

  // Alcohol: Open Food Facts manda sobre Claude; los ml escritos en el nombre mandan sobre todo.
  const pctBebida = bebida?.porcentajeAlcohol ?? null;
  const conAlcohol = categoria === CATEGORIA_CON_ALCOHOL || r.esBebidaConAlcohol === true || (pctBebida !== null && pctBebida > 0);
  if (conAlcohol && (categoria === null || categoria.startsWith("Bebidas"))) categoria = CATEGORIA_CON_ALCOHOL;
  const esAlcohol = categoria === CATEGORIA_CON_ALCOHOL;
  const pctClaude = numeroValido(r.porcentajeAlcohol, porcentajeAlcoholValido);
  const porcentajeAlcohol = esAlcohol ? (pctBebida ?? (pctClaude === null ? null : Math.round(pctClaude * 10) / 10)) : null;
  const ml = esAlcohol ? (extra.mlNombre ?? bebida?.ml ?? numeroValido(r.ml, mlValidos)) : null;

  const sugerencia: Sugerencia = { categoria, descripcion, ingredientes, alergenos, porcentajeAlcohol, ml };
  const vacia = !categoria && !descripcion && !ingredientes && !alergenos.length && porcentajeAlcohol === null && ml === null;
  return vacia ? null : sugerencia;
}

// ── Formulario: llenar solo lo vacío ───────────────────────────────────────────────────

export type CamposAutocompletables = {
  categoriaId: string;
  descripcion: string;
  ingredientes: string;
  porcentajeAlcohol: string;
  ml: string;
};
export type CampoAutocompletable = keyof CamposAutocompletables;

/**
 * Llena SOLO los campos vacíos (no pisa lo que el dueño ya escribió) y dice cuáles llenó,
 * para marcarlos con ✨. Los alérgenos no se llenan: vuelven como sugeridos, sin los que ya estén.
 * Si ya hay una categoría elegida y la sugerida es otra, se devuelve aparte (`categoriaDistinta`)
 * para ofrecer «Usar esta categoría» sin cambiarla sola.
 */
export function llenarSoloVacios(
  actual: CamposAutocompletables & { alergenos: string },
  sugerencia: Sugerencia,
  categorias: readonly { id: string; name: string; active: boolean }[],
): {
  cambios: Partial<CamposAutocompletables>;
  sugeridos: CampoAutocompletable[];
  alergenosSugeridos: string[];
  categoriaDistinta: { id: string; nombre: string } | null;
} {
  const cambios: Partial<CamposAutocompletables> = {};
  const vacio = (campo: CampoAutocompletable) => !actual[campo].trim();
  const poner = (campo: CampoAutocompletable, valor: string | null) => {
    if (valor && vacio(campo)) cambios[campo] = valor;
  };
  const categoria = sugerencia.categoria ? categorias.find((c) => c.active && c.name === sugerencia.categoria) : undefined;
  poner("categoriaId", categoria?.id ?? null);
  poner("descripcion", sugerencia.descripcion);
  poner("ingredientes", sugerencia.ingredientes);
  poner("porcentajeAlcohol", sugerencia.porcentajeAlcohol === null ? null : String(sugerencia.porcentajeAlcohol));
  poner("ml", sugerencia.ml === null ? null : String(sugerencia.ml));

  const yaEstan = new Set(actual.alergenos.split(",").map((a) => a.trim().toLocaleLowerCase("es-PE")).filter(Boolean));
  return {
    cambios,
    sugeridos: Object.keys(cambios) as CampoAutocompletable[],
    alergenosSugeridos: sugerencia.alergenos.filter((a) => !yaEstan.has(a.toLocaleLowerCase("es-PE"))),
    categoriaDistinta: categoria && !vacio("categoriaId") && actual.categoriaId !== categoria.id
      ? { id: categoria.id, nombre: categoria.name } : null,
  };
}
