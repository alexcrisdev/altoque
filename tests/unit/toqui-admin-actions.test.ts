import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// US-152: acción de Toqui del administrador. Sin Claude real ni base: todo simulado.
vi.mock("server-only", () => ({}));

const { obtenerSesion, obtenerFotoMetricas, reservarConsulta, anotarTokens, crear } = vi.hoisted(() => ({
  obtenerSesion: vi.fn(), obtenerFotoMetricas: vi.fn(), reservarConsulta: vi.fn(), anotarTokens: vi.fn(), crear: vi.fn(),
}));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion }));

const FOTO = { moneda: "S/", hoy: { periodo: "Hoy 27/11/2026 hasta las 15:40", ventas: { valor: 840.5 } } };
vi.mock("../../src/features/ia/toqui-admin/foto", () => ({ obtenerFotoMetricas }));

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
import { preguntarAToquiAdmin } from "../../src/features/ia/toqui-admin/actions";
import { INSTRUCCIONES_TOQUI_ADMIN } from "../../src/features/ia/toqui-admin/instrucciones";
import { armarMensajes, MENSAJE_SIN_PERMISO, ultimosMensajes } from "../../src/features/ia/toqui-admin/mensajes-logica";
import { MAX_CARACTERES, MENSAJE_LIMITE, MENSAJE_NO_DISPONIBLE, type MensajeIA } from "../../src/features/ia/reglas";

const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTRO = "99999999-8888-4777-8666-555555555555";
const USUARIO = "11111111-2222-4333-8444-555555555555";
const sesionCon = (...roles: string[]) => ({
  usuario: { id: USUARIO },
  membresias: roles.map((rol) => ({ restaurantId: RESTAURANTE, branchId: null, rol })),
});
const PREGUNTA: MensajeIA[] = [{ rol: "usuario", texto: "¿Cómo me fue hoy?" }];

function respuestaClaude(texto: string) {
  return {
    id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5",
    content: [{ type: "text", text: texto, citations: null }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-clave-falsa-de-prueba");
  vi.stubEnv("IA_SIMULADA", "");
  obtenerFotoMetricas.mockResolvedValue(FOTO);
  reservarConsulta.mockResolvedValue({ resultado: "OK", usoId: 1 });
  anotarTokens.mockResolvedValue(undefined);
  crear.mockResolvedValue(respuestaClaude("Hoy vendiste S/ 840.50 hasta las 15:40."));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const f of [obtenerSesion, obtenerFotoMetricas, reservarConsulta, anotarTokens, crear]) f.mockReset();
});

describe("preguntarAToquiAdmin: permisos", () => {
  it.each([["OWNER"], ["ADMIN"]])("%s recibe la respuesta de Toqui", async (rol) => {
    obtenerSesion.mockResolvedValue(sesionCon(rol));
    const r = await preguntarAToquiAdmin(PREGUNTA);
    expect(r).toMatchObject({ ok: true, texto: "Hoy vendiste S/ 840.50 hasta las 15:40." });
    expect(obtenerFotoMetricas).toHaveBeenCalledWith(RESTAURANTE);
    expect(reservarConsulta).toHaveBeenCalledWith({ restauranteId: RESTAURANTE, usuarioId: USUARIO, funcion: "toqui-admin" });
  });

  it.each([["WAITER"], ["KITCHEN"], ["CASHIER"]])("%s recibe FORBIDDEN sin llamar a Claude ni a la base", async (rol) => {
    obtenerSesion.mockResolvedValue(sesionCon(rol));
    expect(await preguntarAToquiAdmin(PREGUNTA)).toEqual({ ok: false, codigo: "FORBIDDEN", motivo: MENSAJE_SIN_PERMISO });
    expect(obtenerFotoMetricas).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it("sin sesión: FORBIDDEN", async () => {
    obtenerSesion.mockResolvedValue(null);
    expect(await preguntarAToquiAdmin(PREGUNTA)).toMatchObject({ ok: false, codigo: "FORBIDDEN" });
    expect(crear).not.toHaveBeenCalled();
  });

  it("el restaurante sale de la sesión: si es dueño en uno y mesero en otro, usa el del dueño", async () => {
    obtenerSesion.mockResolvedValue({
      usuario: { id: USUARIO },
      membresias: [{ restaurantId: OTRO, branchId: null, rol: "WAITER" }, { restaurantId: RESTAURANTE, branchId: null, rol: "OWNER" }],
    });
    await preguntarAToquiAdmin(PREGUNTA);
    expect(obtenerFotoMetricas).toHaveBeenCalledWith(RESTAURANTE);
  });
});

describe("preguntarAToquiAdmin: llamada a Claude", () => {
  it("instrucciones fijas en caché, foto en el último mensaje, esfuerzo low y 600 tokens", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    await preguntarAToquiAdmin(PREGUNTA);
    const cuerpo = crear.mock.calls[0][0];
    expect(cuerpo.system).toEqual([{ type: "text", text: INSTRUCCIONES_TOQUI_ADMIN, cache_control: { type: "ephemeral" } }]);
    expect(cuerpo.max_tokens).toBe(600);
    expect(cuerpo.output_config).toEqual({ effort: "low" });
    expect(cuerpo.messages).toHaveLength(1);
    expect(cuerpo.messages[0].role).toBe("user");
    expect(cuerpo.messages[0].content).toContain(JSON.stringify(FOTO));
    expect(cuerpo.messages[0].content).toMatch(/PREGUNTA: ¿Cómo me fue hoy\?$/);
    // Las instrucciones no cambian entre preguntas (si no, no hay caché).
    expect(INSTRUCCIONES_TOQUI_ADMIN).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("manda solo los últimos 6 mensajes", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("ADMIN"));
    const largo: MensajeIA[] = Array.from({ length: 11 }, (_, i) => ({ rol: i % 2 ? "asistente" : "usuario", texto: `m${i}` }));
    await preguntarAToquiAdmin(largo);
    const mensajes = crear.mock.calls[0][0].messages;
    expect(mensajes.length).toBeLessThanOrEqual(6);
    expect(mensajes[0]).toEqual({ role: "user", content: "m6" });
    expect(mensajes.at(-1).content).toMatch(/PREGUNTA: m10$/);
  });

  it("error de la IA → «IA no disponible por ahora»", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    crear.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    expect(await preguntarAToquiAdmin(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
  });

  it("límite de uso → «Toqui descansa un rato» sin llamar a Claude", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    reservarConsulta.mockResolvedValue({ resultado: "LIMITE_RESTAURANTE", usoId: null });
    expect(await preguntarAToquiAdmin(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_LIMITE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("si la foto falla del todo, «IA no disponible» sin llamar a Claude", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    obtenerFotoMetricas.mockRejectedValue(new Error("sin base"));
    expect(await preguntarAToquiAdmin(PREGUNTA)).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("datos raros desde el navegador no llegan a Claude", async () => {
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    expect(await preguntarAToquiAdmin("hola" as unknown as MensajeIA[])).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(await preguntarAToquiAdmin([{ rol: "asistente", texto: "Claro:" }])).toEqual({ ok: false, motivo: MENSAJE_NO_DISPONIBLE });
    expect(crear).not.toHaveBeenCalled();
  });

  it("modo simulado: responde sin llamar a Claude", async () => {
    vi.stubEnv("IA_SIMULADA", "1");
    obtenerSesion.mockResolvedValue(sesionCon("OWNER"));
    expect(await preguntarAToquiAdmin(PREGUNTA)).toMatchObject({ ok: true, simulada: true });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe("armarMensajes y ultimosMensajes", () => {
  it("si no cabe en el tope, quita primero los mensajes viejos y empieza por el usuario", () => {
    const viejos: MensajeIA[] = [
      { rol: "usuario", texto: "a".repeat(3000) }, { rol: "asistente", texto: "b".repeat(3000) },
      { rol: "usuario", texto: "¿Y la semana?" },
    ];
    const r = armarMensajes(viejos, JSON.stringify({ dato: "x".repeat(2000) }));
    expect(r).toHaveLength(1);
    expect(INSTRUCCIONES_TOQUI_ADMIN.length + r.reduce((s, m) => s + m.texto.length, 0)).toBeLessThanOrEqual(MAX_CARACTERES);
  });

  it("descarta mensajes mal formados", () => {
    expect(ultimosMensajes([{ rol: "sistema", texto: "x" }, { rol: "usuario", texto: "  " }, { rol: "usuario", texto: "ok" }]))
      .toEqual([{ rol: "usuario", texto: "ok" }]);
  });
});
