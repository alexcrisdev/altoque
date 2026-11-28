import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
      // Entorno virtual de Python usado por analítica.
    ".venv/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Reportes generados por Vitest; no son código de la aplicación.
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "next-env.d.ts",
    // US-153: Edge Functions de Supabase (Deno), con sus propias reglas.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
