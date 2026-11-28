import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { HISTORIAL_MAXIMO, historialParaIA, type Linea, type MensajeToqui, type RespuestaToqui } from "../../src/components/toqui/historial";
import type { MensajeIA, RespuestaIA } from "../../src/features/ia/reglas";

// US-151: Toqui como componente común (sin pantallas reales todavía).
describe("historialParaIA", () => {
  it("quita el saludo inicial y los avisos: la conversación empieza por el usuario", () => {
    const lineas: Linea[] = [
      { de: "asistente", texto: "¡Hola! Soy Toqui." },
      { de: "usuario", texto: "¿Qué vendí más?" },
      { de: "aviso", texto: "IA no disponible por ahora" },
      { de: "usuario", texto: "¿Y hoy?" },
    ];
    expect(historialParaIA(lineas)).toEqual([
      { rol: "usuario", texto: "¿Qué vendí más?" },
      { rol: "usuario", texto: "¿Y hoy?" },
    ]);
  });

  it("manda solo los últimos mensajes y nunca empieza por el asistente", () => {
    const lineas: Linea[] = Array.from({ length: 25 }, (_, i) => ({ de: i % 2 ? "asistente" : "usuario", texto: `m${i}` }));
    const historial = historialParaIA(lineas);
    expect(historial.length).toBeLessThanOrEqual(HISTORIAL_MAXIMO);
    expect(historial[0].rol).toBe("usuario");
    expect(historial.at(-1)).toEqual({ rol: "usuario", texto: "m24" });
  });
});

describe("Toqui y la base de IA encajan", () => {
  it("los tipos son compatibles con preguntarAClaude", () => {
    expectTypeOf<RespuestaIA>().toExtend<RespuestaToqui>();
    expectTypeOf<MensajeToqui>().toEqualTypeOf<MensajeIA>();
  });

  it("el componente no llama a Claude por sí solo ni usa la clave", () => {
    const codigo = ["toqui.tsx", "historial.ts", "personaje.tsx", "index.ts"]
      .map((f) => readFileSync(`src/components/toqui/${f}`, "utf8"))
      .join("\n");
    expect(codigo).not.toMatch(/from\s+["'](?:@anthropic-ai|@\/features\/ia|.*features\/ia)|ANTHROPIC_API_KEY|process\.env/);
    expect(codigo).toContain("responder(historialParaIA(");
  });

  it("guarda la posición con try/catch, respeta reducir movimiento y usa 5 px como arrastre", () => {
    const codigo = readFileSync("src/components/toqui/toqui.tsx", "utf8");
    expect(codigo).toMatch(/UMBRAL_ARRASTRE = 5/);
    expect(codigo).toMatch(/try \{ localStorage\.setItem/);
    expect(codigo).toMatch(/prefers-reduced-motion: reduce/);
    expect(readFileSync("src/components/toqui/toqui.css", "utf8")).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
});
