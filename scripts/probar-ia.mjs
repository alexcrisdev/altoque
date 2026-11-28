// US-151: prueba REAL de la clave de Claude (gasta centavos). Uso: npm run ia:probar
// Pregunta "Responde solo: hola" con max_tokens 32 y muestra la respuesta y los tokens.
// Nunca muestra la clave. Nunca corre en CI (allí no hay clave y se niega a correr).
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

if (process.env.CI) {
  console.error("No se ejecuta en CI: CI siempre usa el modo simulado.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("Falta ANTHROPIC_API_KEY en .env.local (mira docs/ia/README.md).");
  process.exit(1);
}

// El modelo sale de la misma constante que usa la app (src/features/ia/reglas.ts).
const modelo = readFileSync(new URL("../src/features/ia/reglas.ts", import.meta.url), "utf8")
  .match(/MODELO_IA = "([^"]+)"/)?.[1];
if (!modelo) {
  console.error("No se encontró MODELO_IA en src/features/ia/reglas.ts.");
  process.exit(1);
}

const cliente = new Anthropic({ timeout: 20_000, maxRetries: 1 });
try {
  const r = await cliente.messages.create({
    model: modelo,
    max_tokens: 32,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Responde solo: hola" }],
  });
  const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  console.log(`Modelo: ${r.model}`);
  console.log(`Respuesta: ${texto || "(vacía)"}`);
  console.log(`Fin: ${r.stop_reason}`);
  console.log(`Tokens: entrada ${r.usage.input_tokens} · salida ${r.usage.output_tokens}`);
} catch (error) {
  // Solo el tipo y el código: nunca el detalle (podría traer datos de la cuenta).
  const tipo = error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ""}` : "Error";
  console.error(`IA no disponible por ahora (${tipo.trim()}).`);
  process.exit(1);
}
