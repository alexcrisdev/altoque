import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// US-156: «✨ Autocompletar» de productos. Sin Claude, sin base y SIN internet (Open Food Facts simulado).
vi.mock("server-only", () => ({}));

const { obtenerSesion, reservarConsulta, anotarTokens, crear } = vi.hoisted(() => ({
  obtenerSesion: vi.fn(), reservarConsulta: vi.fn(), anotarTokens: vi.fn(), crear: vi.fn(),
}));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion }));
vi.mock("../../src/features/ia/uso", () => ({ reservarConsulta, anotarTokens }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class AnthropicFalso extends real.default {
    constructor(opciones: ConstructorParameters<typeof real.default>[0]) {
      super(opciones);
      Object.defineProperty(this, "messages", { value: { create: crear } });
    }
  }
  return { ...real, default: AnthropicFalso };
});

import Anthropic from "@anthropic-ai/sdk";
import { autocompletarProducto } from "../../src/features/ia/autocompletar-producto/actions";
import {
  buscarBebidaOpenFoodFacts, leerRespuestaOpenFoodFacts, USER_AGENT,
} from "../../src/features/ia/autocompletar-producto/open-food-facts";
import {
  ESQUEMA_AUTOCOMPLETAR, MENSAJE_NO_PUDE, MENSAJE_NOMBRE, llenarSoloVacios, mlDelNombre, pareceBebidaEnvasada,
  validarSugerencia, type Sugerencia,
} from "../../src/features/ia/autocompletar-producto/reglas";
import { MENSAJE_LIMITE } from "../../src/features/ia/reglas";

const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const sesionCon = (rol: string) => ({ usuario: { id: "u1" }, membresias: [{ restaurantId: RESTAURANTE, branchId: null, rol }] });

const LOMO = {
  categoria: "Platos de fondo",
  descripcion: "Trozos de lomo salteados al wok con cebolla y tomate, con papas fritas y arroz.",
  ingredientes: ["lomo de res", "cebolla roja", "tomate", "sillao", "papas", "arroz"],
  alergenosSugeridos: ["Soya", "Gluten"],
  esBebidaConAlcohol: false,
  porcentajeAlcohol: null,
  ml: null,
};
const respuestaClaude = (json: unknown) => ({
  id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5",
  content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json), citations: null }],
  stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 700, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

// ── Validación de la respuesta ─────────────────────────────────────────────────────────

describe("validarSugerencia", () => {
  it("acepta una respuesta correcta y une los ingredientes con comas", () => {
    expect(validarSugerencia(LOMO)).toEqual({
      categoria: "Platos de fondo",
      descripcion: LOMO.descripcion,
      ingredientes: "lomo de res, cebolla roja, tomate, sillao, papas, arroz",
      alergenos: ["Gluten", "Soya"],
      porcentajeAlcohol: null,
      ml: null,
    });
  });

  it("descarta la categoría que no es una de las 10 estándar", () => {
    expect(validarSugerencia({ ...LOMO, categoria: "Comida criolla" })?.categoria).toBeNull();
    expect(validarSugerencia({ ...LOMO, categoria: "platos de fondo" })?.categoria).toBeNull();
  });

  it("descarta textos largos, precios e ingredientes raros", () => {
    expect(validarSugerencia({ ...LOMO, descripcion: "a".repeat(161) })?.descripcion).toBeNull();
    expect(validarSugerencia({ ...LOMO, descripcion: "Rico lomo a solo S/ 25" })?.descripcion).toBeNull();
    expect(validarSugerencia({ ...LOMO, ingredientes: ["x".repeat(41), "tomate"] })?.ingredientes).toBe("tomate");
    expect(validarSugerencia({ ...LOMO, ingredientes: Array.from({ length: 13 }, (_, i) => `i${i}`) })?.ingredientes).toBeNull();
  });

  it("solo alérgenos de la lista fija", () => {
    expect(validarSugerencia({ ...LOMO, alergenosSugeridos: ["Gluten", "Ajo", "Pescado"] })?.alergenos).toEqual(["Gluten", "Pescado"]);
  });

  it("números fuera de rango se descartan", () => {
    const cerveza = { ...LOMO, categoria: "Bebidas con alcohol", esBebidaConAlcohol: true };
    expect(validarSugerencia({ ...cerveza, porcentajeAlcohol: 120, ml: 9000 })).toMatchObject({ porcentajeAlcohol: null, ml: null });
    expect(validarSugerencia({ ...cerveza, porcentajeAlcohol: 5, ml: 620 })).toMatchObject({ porcentajeAlcohol: 5, ml: 620 });
  });

  it("% y ml solo en bebidas con alcohol", () => {
    expect(validarSugerencia({ ...LOMO, porcentajeAlcohol: 5, ml: 620 })).toMatchObject({ porcentajeAlcohol: null, ml: null });
  });

  it("Open Food Facts y los ml del nombre mandan sobre Claude", () => {
    const s = validarSugerencia(
      { ...LOMO, categoria: "Bebidas sin alcohol", esBebidaConAlcohol: false, porcentajeAlcohol: null, ml: 330 },
      { bebida: { nombre: "Cusqueña", ml: 330, porcentajeAlcohol: 5, alergenos: ["Gluten"] }, mlNombre: 620 },
    );
    expect(s).toMatchObject({ categoria: "Bebidas con alcohol", porcentajeAlcohol: 5, ml: 620 });
    expect(s?.alergenos).toContain("Gluten");
  });

  it("si no queda nada útil (plato desconocido o JSON roto) devuelve null", () => {
    expect(validarSugerencia({ categoria: null, descripcion: "", ingredientes: [], alergenosSugeridos: [], esBebidaConAlcohol: false, porcentajeAlcohol: null, ml: null })).toBeNull();
    expect(validarSugerencia(null)).toBeNull();
    expect(validarSugerencia("no es json")).toBeNull();
  });

  it("el esquema cumple las reglas de la salida estructurada (sin mínimos ni largos)", () => {
    const texto = JSON.stringify(ESQUEMA_AUTOCOMPLETAR);
    expect(ESQUEMA_AUTOCOMPLETAR.additionalProperties).toBe(false);
    for (const prohibido of ["minimum", "maximum", "minLength", "maxLength"]) expect(texto).not.toContain(prohibido);
  });
});

describe("bebidas envasadas", () => {
  it.each(["Inca Kola 500 ml", "Coca-Cola", "Pilsen Callao", "Cusqueña 620 ml", "Agua San Mateo", "Gaseosa en lata", "Chela de 1 litro"])(
    "%s → sí", (nombre) => expect(pareceBebidaEnvasada(nombre)).toBe(true));
  it.each(["Lomo saltado", "Ceviche de pescado", "Chicha morada", "Ají de gallina"])(
    "%s → no", (nombre) => expect(pareceBebidaEnvasada(nombre)).toBe(false));

  it("lee los ml del nombre", () => {
    expect(mlDelNombre("Cusqueña 620 ml")).toBe(620);
    expect(mlDelNombre("Inca Kola 1.5 L")).toBe(1500);
    expect(mlDelNombre("Cerveza 33 cl")).toBe(330);
    expect(mlDelNombre("Lomo saltado")).toBeNull();
    expect(mlDelNombre("Bidón 20 litros")).toBeNull(); // más de 5000 ml
  });
});

// ── Formulario: no pisa lo escrito ─────────────────────────────────────────────────────

describe("llenarSoloVacios", () => {
  const categorias = [
    { id: "c-fondo", name: "Platos de fondo", active: true },
    { id: "c-alcohol", name: "Bebidas con alcohol", active: true },
  ];
  const sugerencia: Sugerencia = {
    categoria: "Platos de fondo", descripcion: "Rico", ingredientes: "lomo, papa", alergenos: ["Gluten", "Soya"], porcentajeAlcohol: null, ml: null,
  };
  const vacio = { categoriaId: "", descripcion: "", ingredientes: "", porcentajeAlcohol: "", ml: "", alergenos: "" };

  it("llena los vacíos y dice cuáles llenó (para el ✨)", () => {
    const r = llenarSoloVacios(vacio, sugerencia, categorias);
    expect(r.cambios).toEqual({ categoriaId: "c-fondo", descripcion: "Rico", ingredientes: "lomo, papa" });
    expect(r.sugeridos).toEqual(["categoriaId", "descripcion", "ingredientes"]);
    expect(r.alergenosSugeridos).toEqual(["Gluten", "Soya"]);
  });

  it("no pisa lo que el dueño ya escribió ni repite alérgenos ya puestos", () => {
    const r = llenarSoloVacios({ ...vacio, descripcion: "Mi receta", categoriaId: "c-alcohol", alergenos: "soya" }, sugerencia, categorias);
    expect(r.cambios).toEqual({ ingredientes: "lomo, papa" });
    expect(r.alergenosSugeridos).toEqual(["Gluten"]);
  });

  it("nunca toca precio ni foto (no son campos autocompletables)", () => {
    const r = llenarSoloVacios(vacio, sugerencia, categorias);
    expect(Object.keys(r.cambios)).not.toContain("precio");
    expect(Object.keys(r.cambios)).not.toContain("imageUrl");
  });
});

// ── Open Food Facts (simulado) ─────────────────────────────────────────────────────────

describe("Open Food Facts", () => {
  const RESPUESTA = {
    products: [
      { product_name: "Otra cosa", quantity: "1 kg" },
      { product_name: "Cerveza Cusqueña Dorada", product_quantity: "620", product_quantity_unit: "ml", nutriments: { alcohol_100g: 5 }, allergens_tags: ["en:gluten"] },
    ],
  };

  it("toma el producto que se parece, con ml, % de alcohol y alérgenos", () => {
    expect(leerRespuestaOpenFoodFacts(RESPUESTA, "Cusqueña 620 ml")).toEqual({
      nombre: "Cerveza Cusqueña Dorada", ml: 620, porcentajeAlcohol: 5, alergenos: ["Gluten"],
    });
  });

  it("sin coincidencias o con datos raros → null", () => {
    expect(leerRespuestaOpenFoodFacts({ products: [{ product_name: "Leche" }] }, "Inca Kola")).toBeNull();
    expect(leerRespuestaOpenFoodFacts({ nada: true }, "Inca Kola")).toBeNull();
  });

  it("usa User-Agent genérico (sin correos), timeout y solo manda el nombre", async () => {
    const falso = vi.fn().mockResolvedValue(new Response(JSON.stringify(RESPUESTA), { status: 200 }));
    await buscarBebidaOpenFoodFacts("Cusqueña 620 ml", falso as unknown as typeof fetch);
    const [url, opciones] = falso.mock.calls[0] as [URL, RequestInit];
    expect(url.hostname).toBe("world.openfoodfacts.org");
    expect(url.searchParams.get("search_terms")).toBe("cusquena");
    expect((opciones.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).not.toMatch(/@/);
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("si falla o tarda, devuelve null sin romper", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caido = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect(await buscarBebidaOpenFoodFacts("Inca Kola", caido as unknown as typeof fetch)).toBeNull();
    const error500 = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    expect(await buscarBebidaOpenFoodFacts("Inca Kola", error500 as unknown as typeof fetch)).toBeNull();
  });
});

// ── Acción de servidor ─────────────────────────────────────────────────────────────────

describe("autocompletarProducto", () => {
  const internet = vi.fn();
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-clave-falsa-de-prueba");
    vi.stubEnv("IA_SIMULADA", "");
    vi.stubGlobal("fetch", internet); // si algo intenta salir a internet, la prueba lo detecta
    internet.mockResolvedValue(new Response(JSON.stringify({ products: [] }), { status: 200 }));
    reservarConsulta.mockResolvedValue({ resultado: "OK", usoId: 1 });
    anotarTokens.mockResolvedValue(undefined);
    crear.mockResolvedValue(respuestaClaude(LOMO));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const f of [obtenerSesion, reservarConsulta, anotarTokens, crear, internet]) f.mockReset();
  });

  it.each([["WAITER"], ["KITCHEN"], ["CASHIER"]])("%s → FORBIDDEN sin llamar a la IA ni a internet", async (rol) => {
    obtenerSesion.mockResolvedValue(sesionCon(rol));
    expect(await autocompletarProducto("Lomo saltado")).toMatchObject({ ok: false, codigo: "FORBIDDEN" });
    expect(crear).not.toHaveBeenCalled();
    expect(internet).not.toHaveBeenCalled();
  });

  it.each([["a"], [" "], ["x".repeat(81)]])("nombre inválido %j → error claro sin llamar a nadie", async (nombre) => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    expect(await autocompletarProducto(nombre)).toEqual({ ok: false, codigo: "NOMBRE_INVALIDO", motivo: MENSAJE_NOMBRE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("plato: no consulta Open Food Facts y pide JSON con el esquema a Claude", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("ADMIN"));
    const r = await autocompletarProducto("  lomo   saltado ");
    expect(r).toMatchObject({ ok: true, openFoodFacts: false, sugerencia: { categoria: "Platos de fondo" } });
    expect(internet).not.toHaveBeenCalled();
    const cuerpo = crear.mock.calls[0][0];
    expect(cuerpo.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: ESQUEMA_AUTOCOMPLETAR } });
    expect(cuerpo.max_tokens).toBe(500);
    expect(cuerpo.messages).toEqual([{ role: "user", content: "Producto: lomo saltado" }]);
    expect(reservarConsulta).toHaveBeenCalledWith({ restauranteId: RESTAURANTE, usuarioId: "u1", funcion: "autocompletar-producto" });
  });

  it("bebida envasada: consulta primero Open Food Facts y le pasa sus datos a Claude", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    internet.mockResolvedValue(new Response(JSON.stringify({
      products: [{ product_name: "Cusqueña", product_quantity: 620, product_quantity_unit: "ml", nutriments: { alcohol: 5 }, allergens_tags: ["en:gluten"] }],
    }), { status: 200 }));
    crear.mockResolvedValue(respuestaClaude({ ...LOMO, categoria: "Bebidas con alcohol", esBebidaConAlcohol: true, alergenosSugeridos: [], porcentajeAlcohol: 4.8 }));
    const r = await autocompletarProducto("Cusqueña 620 ml");
    expect(internet).toHaveBeenCalledTimes(1);
    expect(crear.mock.calls[0][0].messages[0].content).toContain("Open Food Facts");
    expect(r).toMatchObject({ ok: true, openFoodFacts: true, sugerencia: { categoria: "Bebidas con alcohol", porcentajeAlcohol: 5, ml: 620, alergenos: ["Gluten"] } });
  });

  it("JSON inválido o vacío → «No pude autocompletar, llénalo a mano»", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    crear.mockResolvedValue(respuestaClaude("{roto"));
    expect(await autocompletarProducto("Plato raro")).toEqual({ ok: false, motivo: MENSAJE_NO_PUDE });
  });

  it("error de la IA → llenarlo a mano; límite → mensaje de descanso", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    crear.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    expect(await autocompletarProducto("Lomo saltado")).toEqual({ ok: false, motivo: MENSAJE_NO_PUDE });
    reservarConsulta.mockResolvedValue({ resultado: "LIMITE_USUARIO", usoId: null });
    expect(await autocompletarProducto("Lomo saltado")).toEqual({ ok: false, motivo: MENSAJE_LIMITE });
  });

  it("modo simulado: respuesta de prueba válida, sin Claude y sin internet (aunque sea bebida)", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    const r = await autocompletarProducto("Inca Kola 500 ml");
    expect(r).toMatchObject({ ok: true, simulada: true, sugerencia: { categoria: "Platos de fondo", alergenos: ["Gluten"] } });
    expect(crear).not.toHaveBeenCalled();
    expect(internet).not.toHaveBeenCalled();
  });
});

describe("categoría ya elegida", () => {
  const categorias = [
    { id: "c-fondo", name: "Platos de fondo", active: true },
    { id: "c-alcohol", name: "Bebidas con alcohol", active: true },
  ];
  const cerveza: Sugerencia = { categoria: "Bebidas con alcohol", descripcion: null, ingredientes: null, alergenos: [], porcentajeAlcohol: 5, ml: 620 };
  const base = { descripcion: "", ingredientes: "", porcentajeAlcohol: "", ml: "", alergenos: "" };

  it("si la sugerida es otra, no la cambia: la ofrece aparte", () => {
    const r = llenarSoloVacios({ ...base, categoriaId: "c-fondo" }, cerveza, categorias);
    expect(r.cambios).toEqual({ porcentajeAlcohol: "5", ml: "620" });
    expect(r.categoriaDistinta).toEqual({ id: "c-alcohol", nombre: "Bebidas con alcohol" });
  });

  it("si es la misma o estaba vacía, no hay nada aparte", () => {
    expect(llenarSoloVacios({ ...base, categoriaId: "c-alcohol" }, cerveza, categorias).categoriaDistinta).toBeNull();
    expect(llenarSoloVacios({ ...base, categoriaId: "" }, cerveza, categorias).categoriaDistinta).toBeNull();
  });
});
