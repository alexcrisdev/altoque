import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const local = (() => {
  try { return ["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname); }
  catch { return false; }
})();

describe.skipIf(!local)("US-098: stock parcial en Supabase local", () => {
  it("solo cambia el producto indicado, conserva vendidos, permisos y la firma anterior", () => {
    const salida = execFileSync("docker", [
      "exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q",
    ], { input: readFileSync("supabase/tests/us098_stock_parcial.sql"), encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    expect(salida).toContain("US-098: stock parcial y permisos aprobados");
  }, 35000);
});
