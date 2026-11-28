import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// US-153: RLS de ai_fragments y búsqueda por parecido, en PostgreSQL local (rollback siempre).
const local = (() => {
  try { const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""); return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname); }
  catch { return false; }
})();

describe.skipIf(!local)("US-153: base vectorial en PostgreSQL local", () => {
  it.each([
    ["rls_admin", "el admin ve solo las opiniones de su restaurante y el manual"],
    ["rls_otro", "otro restaurante no ve las opiniones ajenas"],
    ["rls_mesero", "el mesero no lee opiniones, pero sí el manual"],
    ["anonimo", "un anónimo no lee nada"],
    ["escritura", "nadie escribe desde el navegador"],
    ["funciones", "un usuario del panel no usa las funciones de servicio"],
    ["busqueda", "la búsqueda filtra por restaurante y ordena por similitud"],
    ["guardar", "solo se guardan opiniones de calificaciones reales; el manual se poda"],
  ])("%s: %s (transacción con rollback)", (caso) => {
    const salida = execFileSync("docker", ["exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-v", `caso=${caso}`, "-q"], {
      input: readFileSync("supabase/tests/us153_base_vectorial.sql"), encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
    });
    expect(salida).toContain("US-153: caso aprobado");
  }, 35000);
});
