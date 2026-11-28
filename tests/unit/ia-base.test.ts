import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// US-151: base común de IA. Nunca llama a Claude ni a Supabase: el SDK y la base son falsos.
vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc, from: () => ({ update }) }) }));

// El SDK real (sus clases de error), pero messages.create es falso.
const crear = vi.fn();
const opcionesCliente = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class AnthropicFalso extends real.default {
    constructor(opciones: ConstructorParameters<typeof real.default>[0]) {
      super(opciones);
      opcionesCliente(opciones);
      Object.defineProperty(this, "messages", { value: { create: crear } });
    }
  }
  return { ...real, default: AnthropicFalso };
});

import Anthropic from "@anthropic-ai/sdk";
import { preguntarAClaude, tipoDeError, type PreguntaIA } from "../../src/features/ia/claude";
import {
  LIMITE_POR_RESTAURANTE_DIA, LIMITE_POR_USUARIO_HORA, MENSAJE_LIMITE, MENSAJE_MUY_LARGO, MENSAJE_NO_DISPONIBLE,
  MODELO_IA, RESPUESTA_SIMULADA, decidirCupo, esModoSimulado, quitarDatosPersonales,
} from "../../src/features/ia/reglas";

const PREGUNTA: PreguntaIA = {
  instrucciones: "Eres Toqui, asistente de AlToque. Responde corto.",
  mensajes: [{ rol: "usuario", texto: "¿Cuánto vendí hoy?" }],
  maxTokens: 200,
  uso: { restauranteId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", usuarioId: "11111111-2222-4333-8444-555555555555", funcion: "prueba-unitaria" },
};

function respuestaClaude(texto: string, extra: Partial<Anthropic.Message> = {}) {
  return {
    id: "msg_prueba", type: "message", role: "assistant", model: MODELO_IA,
    content: [{ type: "text", text: texto, citations: null }],
    stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 40, output_tokens: 12, cache_creation_input_tokens: 0, cache_read_input_tokens: 8 },
    ...extra,
  };
}

// El mensaje del error trae datos que nunca deben llegar al log.
const DETALLE = "mensaje con datos que no se deben registrar";
const cuerpoError = { type: "error" };

let registros: string[];

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-clave-falsa-de-prueba");
  vi.stubEnv("IA_SIMULADA", "");
  rpc.mockResolvedValue({ data: [{ resultado: "OK", uso_id: 7 }], error: null });
  eq.mockResolvedValue({ error: null });
  registros = [];
  const guardar = (linea: unknown) => { registros.push(String(linea)); };
  vi.spyOn(console, "info").mockImplementation(guardar);
  vi.spyOn(console, "error").mockImplementation(guardar);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  crear.mockReset();
  rpc.mockReset();
  eq.mockReset();
  update.mockClear();
  opcionesCliente.mockReset();
});

describe("preguntarAClaude: respuesta correcta", () => {
  it("devuelve el texto y los tokens, y respeta las reglas de Haiku 5.5", async () => {
    crear.mockResolvedValue(respuestaClaude("Hoy vendiste S/ 840."));
    const r = await preguntarAClaude(PREGUNTA);
    expect(r).toEqual({ ok: true, texto: "Hoy vendiste S/ 840.", tokens: { entrada: 48, salida: 12 }, simulada: false });

    const cuerpo = crear.mock.calls[0][0];
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.max_tokens).toBe(200);
    expect(cuerpo.output_config).toEqual({ effort: "low" });
    expect(cuerpo.system).toEqual([{ type: "text", text: PREGUNTA.instrucciones, cache_control: { type: "ephemeral" } }]);
    expect(cuerpo.messages).toEqual([{ role: "user", content: "¿Cuánto vendí hoy?" }]);
    for (const prohibido of ["temperature", "top_p", "top_k", "thinking"]) expect(cuerpo).not.toHaveProperty(prohibido);
    expect(opcionesCliente).toHaveBeenCalledWith(expect.objectContaining({ timeout: 20_000, maxRetries: 1 }));
  });

  it("deja que la HU suba el esfuerzo y limita maxTokens al tope", async () => {
    crear.mockResolvedValue(respuestaClaude("ok"));
    await preguntarAClaude({ ...PREGUNTA, esfuerzo: "medium", maxTokens: 999_999 });
    expect(crear.mock.calls[0][0].output_config).toEqual({ effort: "medium" });
    expect(crear.mock.calls[0][0].max_tokens).toBe(4096);
  });

  it("anota los tokens en la tabla de uso y registra solo datos técnicos", async () => {
    crear.mockResolvedValue(respuestaClaude("Hola"));
    await preguntarAClaude({ ...PREGUNTA, mensajes: [{ rol: "usuario", texto: "Soy ana@correo.pe, cel 987 654 321" }] });
    expect(rpc).toHaveBeenCalledWith("reservar_consulta_ia", expect.objectContaining({
      p_funcion: "prueba-unitaria", p_limite_usuario_hora: LIMITE_POR_USUARIO_HORA, p_limite_restaurante_dia: LIMITE_POR_RESTAURANTE_DIA,
    }));
    expect(update).toHaveBeenCalledWith({ input_tokens: 48, output_tokens: 12 });
    expect(eq).toHaveBeenCalledWith("id", 7);
    // A Claude no le llegan el correo ni el teléfono.
    expect(crear.mock.calls[0][0].messages[0].content).toBe("Soy [correo], cel [teléfono]");
    const log = registros.join("\n");
    expect(JSON.parse(registros[0])).toEqual({ evento: "ia", modelo: MODELO_IA, funcion: "prueba-unitaria", resultado: "ok", tokens: { entrada: 48, salida: 12 } });
    for (const secreto of ["sk-ant", "ana@correo", "987", "Soy"]) expect(log).not.toContain(secreto);
  });

  it("rechaza conversaciones que terminan en el asistente (prefill) sin llamar a Claude", async () => {
    const r = await preguntarAClaude({ ...PREGUNTA, mensajes: [{ rol: "usuario", texto: "hola" }, { rol: "asistente", texto: "Claro:" }] });
    expect(r).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(crear).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza textos muy largos sin gastar", async () => {
    const r = await preguntarAClaude({ ...PREGUNTA, mensajes: [{ rol: "usuario", texto: "a".repeat(9000) }] });
    expect(r).toEqual({ ok: false, motivo: MENSAJE_MUY_LARGO });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe("preguntarAClaude: errores → «IA no disponible por ahora»", () => {
  it.each([
    ["clave inválida", new Anthropic.AuthenticationError(401, cuerpoError, DETALLE, new Headers()), "clave-invalida"],
    ["límite de la API", new Anthropic.RateLimitError(429, cuerpoError, DETALLE, new Headers()), "limite-api"],
    ["petición inválida", new Anthropic.BadRequestError(400, cuerpoError, DETALLE, new Headers()), "peticion-invalida"],
    ["servidor caído", new Anthropic.InternalServerError(500, cuerpoError, DETALLE, new Headers()), "api-500"],
    ["timeout", new Anthropic.APIConnectionTimeoutError(), "timeout"],
    ["sin internet", new Anthropic.APIConnectionError({ message: "fallo" }), "sin-conexion"],
    ["error raro", new Error("algo con ana@correo.pe"), "desconocido"],
  ])("%s", async (_nombre, error, tipo) => {
    crear.mockRejectedValue(error);
    const r = await preguntarAClaude(PREGUNTA);
    expect(r).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(tipoDeError(error)).toBe(tipo);
    const log = registros.join("\n");
    expect(JSON.parse(registros[0]).resultado).toBe(tipo);
    expect(log).not.toContain("mensaje con datos");
    expect(log).not.toContain("ana@correo");
  });

  it("si Claude rechaza o no devuelve texto, también es «no disponible»", async () => {
    crear.mockResolvedValueOnce(respuestaClaude("", { stop_reason: "refusal" }));
    expect(await preguntarAClaude(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    crear.mockResolvedValueOnce(respuestaClaude("   "));
    expect(await preguntarAClaude(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
  });

  it("si anotar los tokens falla, igual entrega la respuesta", async () => {
    crear.mockResolvedValue(respuestaClaude("Listo"));
    eq.mockResolvedValue({ error: { message: "falló" } });
    expect(await preguntarAClaude(PREGUNTA)).toMatchObject({ ok: true, texto: "Listo" });
  });
});

describe("límite de uso", () => {
  it.each([["LIMITE_USUARIO"], ["LIMITE_RESTAURANTE"]])("%s: Toqui descansa y no llama a Claude", async (resultado) => {
    rpc.mockResolvedValue({ data: [{ resultado, uso_id: null }], error: null });
    expect(await preguntarAClaude(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_LIMITE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("si la base no responde, no gasta (falla cerrado)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "sin conexión" } });
    expect(await preguntarAClaude(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("decidirCupo usa las constantes", () => {
    expect(decidirCupo({ usuarioHora: 0, restauranteDia: 0 })).toBe("OK");
    expect(decidirCupo({ usuarioHora: LIMITE_POR_USUARIO_HORA, restauranteDia: 0 })).toBe("LIMITE_USUARIO");
    expect(decidirCupo({ usuarioHora: 0, restauranteDia: LIMITE_POR_RESTAURANTE_DIA })).toBe("LIMITE_RESTAURANTE");
  });
});

describe("modo simulado", () => {
  it("sin clave no llama a Claude ni a la base", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await preguntarAClaude(PREGUNTA);
    expect(r).toEqual({ ok: true, texto: RESPUESTA_SIMULADA, tokens: { entrada: 0, salida: 0 }, simulada: true });
    expect(crear).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("IA_SIMULADA=1 gana aunque haya clave", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    expect(await preguntarAClaude(PREGUNTA)).toMatchObject({ ok: true, simulada: true });
    expect(crear).not.toHaveBeenCalled();
  });

  it("esModoSimulado", () => {
    expect(esModoSimulado({})).toBe(true);
    expect(esModoSimulado({ ANTHROPIC_API_KEY: "  " })).toBe(true);
    expect(esModoSimulado({ ANTHROPIC_API_KEY: "x", IA_SIMULADA: "1" })).toBe(true);
    expect(esModoSimulado({ ANTHROPIC_API_KEY: "x" })).toBe(false);
  });

  it("CI y E2E no tienen la clave y fuerzan el modo simulado", () => {
    for (const archivo of readdirSync(".github/workflows")) {
      expect(readFileSync(`.github/workflows/${archivo}`, "utf8"), archivo).not.toMatch(/ANTHROPIC/);
    }
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toMatch(/IA_SIMULADA: "1"/);
    expect(readFileSync(".github/workflows/e2e.yml", "utf8")).toMatch(/IA_SIMULADA: "1"/);
    expect(readFileSync("playwright.config.ts", "utf8")).toMatch(/IA_SIMULADA: "1"/);
  });
});

describe("quitarDatosPersonales", () => {
  it.each([
    ["Escríbeme a juan.perez@gmail.com", "Escríbeme a [correo]"],
    ["Mi cel es 987654321", "Mi cel es [teléfono]"],
    ["Llama al 987 654 321 o al 987-654-321", "Llama al [teléfono] o al [teléfono]"],
    ["WhatsApp +51 987 654 321", "WhatsApp [teléfono]"],
    ["Fijo (01) 234-5678", "Fijo [teléfono]"],
    ["De España: +34 612 34 56 78", "De España: [teléfono]"],
  ])("%s", (entrada, esperado) => {
    expect(quitarDatosPersonales(entrada)).toBe(esperado);
  });

  it("no toca precios, cantidades ni números de pedido", () => {
    const texto = "Pedido N.º 12: 2 × Lomo saltado S/ 25.50, Cusqueña 620 ml, total S/ 1250.00, mesa 6";
    expect(quitarDatosPersonales(texto)).toBe(texto);
  });
});

// US-156: salida estructurada OPCIONAL (retrocompatible).
describe("preguntarAClaude: salida estructurada opcional", () => {
  const ESQUEMA = {
    type: "object",
    properties: { categoria: { type: "string" } },
    required: ["categoria"],
    additionalProperties: false,
  };

  it("con formato manda output_config.format json_schema y devuelve el JSON como texto", async () => {
    crear.mockResolvedValue(respuestaClaude('{"categoria":"Platos de fondo"}'));
    const r = await preguntarAClaude({ ...PREGUNTA, formato: { esquema: ESQUEMA } });
    expect(crear.mock.calls[0][0].output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: ESQUEMA } });
    expect(r).toMatchObject({ ok: true, texto: '{"categoria":"Platos de fondo"}' });
  });

  it("sin formato la llamada queda igual que antes (US-152 y demás HU no cambian)", async () => {
    crear.mockResolvedValue(respuestaClaude("ok"));
    await preguntarAClaude(PREGUNTA);
    expect(crear.mock.calls[0][0].output_config).toEqual({ effort: "low" });
    expect(crear.mock.calls[0][0].output_config).not.toHaveProperty("format");
  });

  it("en modo simulado devuelve la respuestaSimulada de la HU (o la fija si no hay)", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    expect(await preguntarAClaude({ ...PREGUNTA, respuestaSimulada: '{"categoria":"Postres"}' }))
      .toMatchObject({ ok: true, texto: '{"categoria":"Postres"}', simulada: true });
    expect(await preguntarAClaude(PREGUNTA)).toMatchObject({ texto: RESPUESTA_SIMULADA });
    expect(crear).not.toHaveBeenCalled();
  });
});
