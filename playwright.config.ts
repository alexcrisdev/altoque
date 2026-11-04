import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Node 22 carga el entorno local sin añadir dependencias ni sobrescribir CI.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Next.js lee su propia .env.local. No transmitir la clave privada al worker.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const nombre of ["E2E_MESA_TOKEN", "E2E_MOSTRADOR_TOKEN"]) {
  const valor = process.env[nombre]?.trim();
  if (valor && (/token_de|token_del|aqui|aquí/i.test(valor) || valor.includes("/"))) {
    throw new Error(`${nombre} contiene un ejemplo o un enlace completo. Copia solo el token real después de /m/.`);
  }
}

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1, // Todos los entornos comparten las mesas demo.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
