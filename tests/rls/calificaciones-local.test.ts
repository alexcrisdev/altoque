import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const local = (() => {
  try { const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""); return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname); }
  catch { return false; }
})();

describe.skipIf(!local)("US-093: permisos y reglas en PostgreSQL local", () => {
  it.each([
    "guardar", "duplicado", "otro_restaurante", "roles", "anonimo", "estrellas", "comentario",
    "sin_pagar", "pagado", "credenciales", "cancelado",
  ])("%s (transacción con rollback)", (caso) => {
    const salida = execFileSync("docker", ["exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-v", `caso=${caso}`, "-q"], {
      input: readFileSync("supabase/tests/us093_calificaciones.sql"), encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
    });
    expect(salida).toContain("US-093: caso aprobado");
  }, 35000);
});
