import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const esLocal = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
})();

// SQL con datos propios, aserciones y ROLLBACK. El contenedor está fijado al
// proyecto local; nunca se ejecuta en CI contra la base compartida.
describe.skipIf(!esLocal)("US-088 sobre US-097: boletas en Supabase local", () => {
  it("valida snapshot, correo, correlativo, RLS e idempotencia y descarta sus datos", () => {
    const salida = execFileSync("docker", [
      "exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q",
    ], { input: readFileSync("supabase/tests/us088_boletas.sql"), encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    expect(salida).toContain("US-088: verificaciones SQL y RLS locales aprobadas");
  }, 35000);
});
