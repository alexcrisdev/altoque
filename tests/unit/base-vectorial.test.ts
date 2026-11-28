import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// US-153: base vectorial (RAG) de Toqui. Sin Supabase, sin Claude y sin internet: todo simulado.
vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  rpc: vi.fn(), obtenerSesion: vi.fn(), reservarConsulta: vi.fn(), anotarTokens: vi.fn(), crear: vi.fn(), obtenerFotoMetricas: vi.fn(),
}));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc: m.rpc }) }));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: m.obtenerSesion }));
vi.mock("../../src/features/ia/uso", () => ({ reservarConsulta: m.reservarConsulta, anotarTokens: m.anotarTokens }));
vi.mock("../../src/features/ia/toqui-admin/foto", () => ({ obtenerFotoMetricas: m.obtenerFotoMetricas }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class AnthropicFalso extends real.default {
    constructor(opciones: ConstructorParameters<typeof real.default>[0]) {
      super(opciones);
      Object.defineProperty(this, "messages", { value: { create: m.crear } });
    }
  }
  return { ...real, default: AnthropicFalso };
});

import {
  armarMensajeConFragmentos, DIMENSIONES, elegirFuente, limpiarComentario, quitarNombres, respuestaSinFragmentos,
  SIN_COMENTARIOS, SIN_MANUAL, VECTOR_SIMULADO, vectorATexto, type FragmentoEncontrado,
} from "../../src/features/ia/vectorial/reglas";
import { embeberTextos, urlEmbeber } from "../../src/features/ia/vectorial/embeber";
import { buscarFragmentos, indexarComentariosPendientes } from "../../src/features/ia/vectorial/fragmentos";
import { preguntarAToquiAdmin } from "../../src/features/ia/toqui-admin/actions";
import { INSTRUCCIONES_TOQUI_ADMIN } from "../../src/features/ia/toqui-admin/instrucciones";
import { leerManual, seccionesDelManual } from "../../scripts/indexar-manual.mjs";

const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRETO = "secreto-de-prueba-de-al-menos-32-caracteres";
const vector = (valor = 0.05) => Array.from({ length: DIMENSIONES }, () => valor);
const respuestaHttp = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

const FRAGMENTOS: FragmentoEncontrado[] = [
  { id: "f1", source_id: "r1", content: "Esperé 40 minutos por mi ceviche", service_stars: 2, waiter_stars: 3, source_date: "2026-11-20", similitud: 0.86 },
  { id: "f2", source_id: "r2", content: "La comida llegó fría", service_stars: 3, waiter_stars: 4, source_date: "2026-11-22", similitud: 0.79 },
];

// ── 1. Enrutador de preguntas ──────────────────────────────────────────────────────────

describe("elegirFuente", () => {
  it.each([
    "¿De qué se quejan mis clientes?", "¿Qué dicen de la atención?", "¿Qué opinan del lomo?",
    "Muéstrame los comentarios de esta semana", "¿Hay reseñas malas?", "¿Cómo son las calificaciones?",
  ])("opiniones: %s", (p) => expect(elegirFuente(p)).toBe("REVIEW"));

  it.each([
    "¿Cómo genero el QR de una mesa?", "¿Cómo se usa el Autocompletar?", "¿Cómo cierro una cuenta?",
    "¿Dónde veo los reportes?", "¿Para qué sirve el stock del día?", "¿Qué es el plano 3D?", "Dame los pasos para crear una mesa",
  ])("manual: %s", (p) => expect(elegirFuente(p)).toBe("MANUAL"));

  it.each([
    "¿Cómo me fue hoy?", "¿Qué vendí menos esta semana?", "¿Cuál es mi hora pico?", "¿Qué se agotó?",
    "¿Cuánto debo preparar mañana?", "¿Cómo va la satisfacción?", "¿Cómo se vendió el lomo?", "¿Qué es lo que más vendí?",
  ])("métricas: %s", (p) => expect(elegirFuente(p)).toBe("METRICAS"));
});

// ── 2. Limpieza antes de indexar ───────────────────────────────────────────────────────

describe("limpiarComentario", () => {
  it("quita correos, teléfonos y nombres del personal y del cliente", () => {
    const texto = "Juan Pérez nos atendió lento. Escríbanme a ana@correo.pe o al 987 654 321. Gracias, Ana";
    const limpio = limpiarComentario(texto, ["Juan Pérez", "Ana Torres"]);
    expect(limpio).toBe("[nombre] [nombre] nos atendió lento. Escríbanme a [correo] o al [teléfono]. Gracias, [nombre]");
  });

  it("reconoce el nombre con o sin tilde y sin importar mayúsculas", () => {
    expect(quitarNombres("perez y PÉREZ", ["Juan Pérez"])).toBe("[nombre] y [nombre]");
  });

  it("no tapa partes de otras palabras ni nombres de 1 o 2 letras", () => {
    expect(quitarNombres("Anacleto pidió ají", ["Ana", "Al"])).toBe("Anacleto pidió ají");
  });

  it("un comentario vacío no se indexa", () => {
    expect(limpiarComentario("   ")).toBeNull();
  });
});

// ── 3. Mensaje con fragmentos y respuesta sin fragmentos ───────────────────────────────

describe("armarMensajeConFragmentos", () => {
  it("opiniones: numeradas, con fecha y estrellas, y la pregunta al final", () => {
    const texto = armarMensajeConFragmentos("¿De qué se quejan?", "REVIEW", FRAGMENTOS);
    expect(texto).toContain("COMENTARIOS DE CLIENTES (2");
    expect(texto).toContain('[1] (20/11/2026 · servicio 2★ · mesero 3★) "Esperé 40 minutos por mi ceviche"');
    expect(texto).toMatch(/PREGUNTA: ¿De qué se quejan\?$/);
  });

  it("manual: secciones con su id", () => {
    const texto = armarMensajeConFragmentos("¿Cómo genero el QR?", "MANUAL", [{ ...FRAGMENTOS[0], source_id: "manual:mesas", content: "Mesas y QR\n- Toca «Generar QR»" }]);
    expect(texto).toContain("MANUAL DE ALTOQUE");
    expect(texto).toContain("[manual:mesas]\nMesas y QR");
  });

  it("sin fragmentos: respuestas fijas", () => {
    expect(respuestaSinFragmentos("REVIEW")).toBe("Aún no tengo comentarios sobre eso.");
    expect(respuestaSinFragmentos("MANUAL")).toBe("No encuentro eso en el manual.");
  });

  it("las instrucciones ya no dicen «pronto» para opiniones y explican cómo agrupar", () => {
    expect(INSTRUCCIONES_TOQUI_ADMIN).toContain("Agrupa por tema");
    expect(INSTRUCCIONES_TOQUI_ADMIN).toContain(SIN_COMENTARIOS);
    expect(INSTRUCCIONES_TOQUI_ADMIN).toContain(SIN_MANUAL);
    expect(INSTRUCCIONES_TOQUI_ADMIN).not.toMatch(/opiniones o comentarios de clientes, tutoriales/);
    expect(readFileSync("src/features/ia/toqui-admin/toqui-admin.tsx", "utf8")).toContain('"¿De qué se quejan mis clientes?"');
  });
});

// ── Embeddings (Edge Function simulada) ────────────────────────────────────────────────

describe("embeberTextos", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-clave-falsa-de-prueba");
    vi.stubEnv("IA_SIMULADA", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("EMBEBER_SECRETO", SECRETO);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("en pruebas y CI devuelve vectores falsos fijos sin llamar a nadie", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    const buscar = vi.fn();
    expect(await embeberTextos(["hola", "chau"], buscar)).toEqual([[...VECTOR_SIMULADO], [...VECTOR_SIMULADO]]);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("llama a la Edge Function con el secreto, los textos y un timeout", async () => {
    const buscar = vi.fn().mockResolvedValue(respuestaHttp({ vectores: [vector()] }));
    expect(await embeberTextos([" demora "], buscar)).toEqual([vector()]);
    const [url, opciones] = buscar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proyecto.supabase.co/functions/v1/embeber");
    expect((opciones.headers as Record<string, string>)["x-altoque-secreto"]).toBe(SECRETO);
    expect(JSON.parse(opciones.body as string)).toEqual({ textos: ["demora"] });
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["error HTTP", () => respuestaHttp({ error: "x" }, 500)],
    ["vector de otro tamaño", () => respuestaHttp({ vectores: [[0.1, 0.2]] })],
    ["cantidad distinta", () => respuestaHttp({ vectores: [] })],
  ])("%s → null", async (_n, crearRespuesta) => {
    expect(await embeberTextos(["hola"], vi.fn().mockResolvedValue(crearRespuesta()))).toBeNull();
  });

  it("timeout o sin red → null (nunca lanza)", async () => {
    expect(await embeberTextos(["hola"], vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")))).toBeNull();
  });

  it("valida la entrada: 1 a 20 textos de hasta 1000 caracteres; sin secreto no llama", async () => {
    const buscar = vi.fn();
    expect(await embeberTextos([], buscar)).toBeNull();
    expect(await embeberTextos(Array(21).fill("x"), buscar)).toBeNull();
    expect(await embeberTextos(["x".repeat(1001)], buscar)).toBeNull();
    vi.stubEnv("EMBEBER_SECRETO", "corto");
    expect(await embeberTextos(["hola"], buscar)).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
    expect(urlEmbeber({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/" })).toBe("https://x.supabase.co/functions/v1/embeber");
  });
});

// ── Capa de datos (funciones fijas de la base, simuladas) ──────────────────────────────

describe("indexarComentariosPendientes y buscarFragmentos", () => {
  beforeEach(() => { vi.stubEnv("IA_SIMULADA", "1"); });
  afterEach(() => { vi.unstubAllEnvs(); m.rpc.mockReset(); });

  it("guarda los comentarios ya limpios, con estrellas y fecha, y nunca los nombres", async () => {
    m.rpc.mockImplementation((nombre: string) => Promise.resolve(nombre === "comentarios_sin_indexar_ia"
      ? { data: [
          { rating_id: "r1", comentario: "Rosa nos atendió lento, llamen al 987654321", service_stars: 2, waiter_stars: 1, fecha: "2026-11-20", nombres: ["Rosa Díaz", "Carlos"] },
          { rating_id: "r2", comentario: "   ", service_stars: 5, waiter_stars: 5, fecha: "2026-11-21", nombres: [] },
        ], error: null }
      : { data: 1, error: null }));
    expect(await indexarComentariosPendientes(RESTAURANTE)).toBe(1);
    expect(m.rpc).toHaveBeenCalledWith("comentarios_sin_indexar_ia", { p_restaurante: RESTAURANTE, p_limite: 50 });
    const guardar = m.rpc.mock.calls.find(([n]) => n === "guardar_fragmentos_ia")!;
    const [fragmento] = guardar[1].p_fragmentos;
    expect(fragmento).toMatchObject({
      restaurant_id: RESTAURANTE, source: "REVIEW", source_id: "r1", service_stars: 2, waiter_stars: 1, source_date: "2026-11-20",
      content: "[nombre] nos atendió lento, llamen al [teléfono]",
    });
    expect(JSON.stringify(guardar)).not.toMatch(/Rosa|Díaz|Carlos|987654321/);
    expect(fragmento.embedding).toBe(vectorATexto(VECTOR_SIMULADO));
  });

  it("busca siempre con el restaurante, la fuente, la cantidad y la similitud mínima", async () => {
    m.rpc.mockResolvedValue({ data: [{ ...FRAGMENTOS[0], similitud: "0.86" }], error: null });
    const r = await buscarFragmentos(RESTAURANTE, "REVIEW", vector(), 10, 0.7);
    expect(m.rpc).toHaveBeenCalledWith("buscar_fragmentos_ia", {
      p_restaurante: RESTAURANTE, p_fuente: "REVIEW", p_embedding: vectorATexto(vector()), p_cantidad: 10, p_similitud_minima: 0.7,
    });
    expect(r[0].similitud).toBe(0.86);
  });
});

// ── Toqui con la base vectorial ────────────────────────────────────────────────────────

describe("preguntarAToquiAdmin con opiniones y manual", () => {
  const sesion = (rol: string) => ({ usuario: { id: "u1" }, membresias: [{ restaurantId: RESTAURANTE, branchId: null, rol }] });
  const respuestaClaude = (texto: string) => ({
    id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5",
    content: [{ type: "text", text: texto, citations: null }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  });
  const internet = vi.fn();

  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-clave-falsa-de-prueba");
    vi.stubEnv("IA_SIMULADA", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("EMBEBER_SECRETO", SECRETO);
    vi.stubGlobal("fetch", internet);
    internet.mockImplementation(() => Promise.resolve(respuestaHttp({ vectores: [vector()] }))); // un Response nuevo por llamada
    m.obtenerSesion.mockResolvedValue(sesion("OWNER"));
    m.reservarConsulta.mockResolvedValue({ resultado: "OK", usoId: 1 });
    m.anotarTokens.mockResolvedValue(undefined);
    m.crear.mockResolvedValue(respuestaClaude("- **Demora** (1 comentario): «Esperé 40 minutos por mi ceviche»."));
    m.rpc.mockImplementation((nombre: string) => Promise.resolve(
      nombre === "comentarios_sin_indexar_ia" ? { data: [], error: null }
        : nombre === "buscar_fragmentos_ia" ? { data: FRAGMENTOS, error: null } : { data: 0, error: null }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const f of [m.rpc, m.obtenerSesion, m.reservarConsulta, m.anotarTokens, m.crear, m.obtenerFotoMetricas, internet]) f.mockReset();
  });

  it("opiniones: indexa los nuevos, busca en SU restaurante y manda los fragmentos (sin la foto)", async () => {
    const r = await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿De qué se quejan mis clientes?" }]);
    expect(r).toMatchObject({ ok: true, texto: expect.stringContaining("Demora") });
    const llamadas = m.rpc.mock.calls.map(([n]) => n);
    expect(llamadas.indexOf("comentarios_sin_indexar_ia")).toBeLessThan(llamadas.indexOf("buscar_fragmentos_ia"));
    expect(m.rpc).toHaveBeenCalledWith("buscar_fragmentos_ia", expect.objectContaining({ p_restaurante: RESTAURANTE, p_fuente: "REVIEW" }));
    expect(m.obtenerFotoMetricas).not.toHaveBeenCalled();
    const contenido = m.crear.mock.calls[0][0].messages.at(-1).content;
    expect(contenido).toContain("COMENTARIOS DE CLIENTES (2");
    expect(contenido).toContain("Esperé 40 minutos por mi ceviche");
    expect(m.reservarConsulta).toHaveBeenCalledWith(expect.objectContaining({ funcion: "toqui-opiniones" }));
  });

  it("manual: busca en el manual (sin indexar opiniones)", async () => {
    await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿Cómo genero el QR de una mesa?" }]);
    expect(m.rpc).not.toHaveBeenCalledWith("comentarios_sin_indexar_ia", expect.anything());
    expect(m.rpc).toHaveBeenCalledWith("buscar_fragmentos_ia", expect.objectContaining({ p_fuente: "MANUAL" }));
    expect(m.crear.mock.calls[0][0].messages.at(-1).content).toContain("MANUAL DE ALTOQUE");
  });

  it("sin fragmentos parecidos: respuesta fija y NO se llama a Claude", async () => {
    m.rpc.mockImplementation((nombre: string) => Promise.resolve(nombre === "buscar_fragmentos_ia" ? { data: [], error: null } : { data: [], error: null }));
    expect(await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿Qué dicen de la limpieza?" }]))
      .toMatchObject({ ok: true, texto: SIN_COMENTARIOS });
    expect(await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿Cómo imprimo la boleta?" }]))
      .toMatchObject({ ok: true, texto: SIN_MANUAL });
    expect(m.crear).not.toHaveBeenCalled();
  });

  it("si indexar falla, igual busca con lo que ya hay", async () => {
    m.rpc.mockImplementation((nombre: string) => Promise.resolve(
      nombre === "comentarios_sin_indexar_ia" ? { data: null, error: { message: "x" } } : { data: FRAGMENTOS, error: null }));
    expect(await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿De qué se quejan?" }])).toMatchObject({ ok: true });
  });

  it("si los vectores fallan: «IA no disponible por ahora»", async () => {
    internet.mockResolvedValue(respuestaHttp({ error: "x" }, 503));
    expect(await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿De qué se quejan?" }]))
      .toEqual({ ok: false, motivo: "IA no disponible por ahora" });
    expect(m.crear).not.toHaveBeenCalled();
  });

  it("modo simulado: respuesta simulada sin base vectorial, sin internet y sin Claude", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    const r = await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿De qué se quejan mis clientes?" }]);
    expect(r).toMatchObject({ ok: true, simulada: true, texto: expect.stringContaining("Respuesta simulada de Toqui") });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(internet).not.toHaveBeenCalled();
    expect(m.crear).not.toHaveBeenCalled();
  });

  it.each([["WAITER"], ["KITCHEN"], ["CASHIER"]])("%s → FORBIDDEN sin buscar ni llamar a Claude", async (rol) => {
    m.obtenerSesion.mockResolvedValue(sesion(rol));
    expect(await preguntarAToquiAdmin([{ rol: "usuario", texto: "¿De qué se quejan?" }])).toMatchObject({ codigo: "FORBIDDEN" });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.crear).not.toHaveBeenCalled();
  });
});

// ── Manual de uso ──────────────────────────────────────────────────────────────────────

describe("manual de uso (docs/manual)", () => {
  it("separa las secciones «##» con su id", () => {
    expect(seccionesDelManual("# Título\nintro\n## Mesas y QR\n- uno\n- dos\n## Vacía\n")).toEqual([
      { id: "manual:mesas-y-qr", titulo: "Mesas y QR", contenido: "Mesas y QR\n- uno\n- dos" },
    ]);
  });

  it("el manual real tiene los temas pedidos, de 3 a 8 líneas cada uno", () => {
    const secciones = leerManual() as { id: string; contenido: string }[];
    const ids = secciones.map((s) => s.id);
    for (const tema of ["mesas", "productos", "stock", "pedidos", "cuentas", "dashboard", "roles"]) {
      expect(ids.some((id) => id.includes(tema)), tema).toBe(true);
    }
    for (const s of secciones) {
      const lineas = s.contenido.split("\n").length - 1;
      expect(lineas, s.id).toBeGreaterThanOrEqual(3);
      expect(lineas, s.id).toBeLessThanOrEqual(8);
      expect(s.contenido.length).toBeLessThanOrEqual(1000);
    }
    expect(readFileSync("docs/manual/manual-admin.md", "utf8")).not.toMatch(/@|\b9\d{8}\b/);
  });
});
