import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import { autorizacionValida, leerDias, rangoConsolidacion } from "../../src/features/dashboard/ventas-diarias-logica";
import { ejecutarConsolidacionVentas } from "../../src/features/dashboard/ventas-diarias";
import { PREFIJOS_PRUEBA } from "../../src/features/dashboard/pedidos-de-prueba";
import { config } from "../../src/proxy";

const SECRETO = "s".repeat(40);
const MIGRACIONES = join(process.cwd(), "supabase", "migrations");

describe("US-145: autorización del cron en tiempo constante", () => {
  it("acepta solo «Bearer <secreto>» exacto", () => {
    expect(autorizacionValida(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
    expect(autorizacionValida(`Bearer ${SECRETO}x`, SECRETO)).toBe(false);
    expect(autorizacionValida("Bearer corto", SECRETO)).toBe(false);
    expect(autorizacionValida(SECRETO, SECRETO)).toBe(false);
    expect(autorizacionValida(null, SECRETO)).toBe(false);
  });
  it("sin secreto o con uno corto, nadie pasa", () => {
    expect(autorizacionValida("Bearer ", undefined)).toBe(false);
    expect(autorizacionValida("Bearer abc", "abc")).toBe(false);
  });
});

describe("US-145: días a recalcular", () => {
  it("por defecto 7; acepta de 1 a 35", () => {
    expect(leerDias(null)).toBe(7);
    expect(leerDias("")).toBe(7);
    expect(leerDias("1")).toBe(1);
    expect(leerDias("35")).toBe(35);
  });
  it.each(["0", "36", "abc", "1.5", "-1", "007"])("rechaza %s", (valor) => {
    expect(leerDias(valor)).toBeNull();
  });
  it("termina ayer en hora de Lima, nunca hoy", () => {
    // 00:30 del 25/11 en Lima (05:30 UTC): ayer es el 24.
    expect(rangoConsolidacion(Date.parse("2026-11-25T05:30:00Z"), 7)).toEqual({ desde: "2026-11-18", hasta: "2026-11-24" });
    // 23:30 del 24/11 en Lima (04:30 UTC del 25): todavía es 24; ayer es el 23.
    expect(rangoConsolidacion(Date.parse("2026-11-25T04:30:00Z"), 1)).toEqual({ desde: "2026-11-23", hasta: "2026-11-23" });
  });
});

describe("US-145: ejecutar la consolidación", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(crearClienteAdmin).mockReturnValue({ rpc } as never);
    vi.stubEnv("VENTAS_CRON_SECRET", SECRETO);
  });
  const ahora = Date.parse("2026-11-25T05:30:00Z");

  it("sin secreto configurado responde 503 y no toca la base", async () => {
    vi.stubEnv("VENTAS_CRON_SECRET", "");
    expect((await ejecutarConsolidacionVentas(`Bearer ${SECRETO}`, null, ahora)).estado).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("con secreto incorrecto responde 401 y no toca la base", async () => {
    expect((await ejecutarConsolidacionVentas("Bearer otro", null, ahora)).estado).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("con días inválidos responde 400", async () => {
    expect((await ejecutarConsolidacionVentas(`Bearer ${SECRETO}`, "99", ahora)).estado).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("recalcula los últimos días terminados y solo devuelve conteos", async () => {
    rpc.mockResolvedValue({ data: 12, error: null });
    const resultado = await ejecutarConsolidacionVentas(`Bearer ${SECRETO}`, "35", ahora);
    expect(rpc).toHaveBeenCalledWith("consolidar_ventas_diarias", { p_desde: "2026-10-21", p_hasta: "2026-11-24" });
    expect(resultado).toEqual({ estado: 200, cuerpo: { desde: "2026-10-21", hasta: "2026-11-24", filasActualizadas: 12 } });
  });
  it("si la base falla responde 500 sin detalles internos", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "detalle interno" } });
    const resultado = await ejecutarConsolidacionVentas(`Bearer ${SECRETO}`, null, ahora);
    expect(resultado.estado).toBe(500);
    expect(JSON.stringify(resultado.cuerpo)).not.toContain("detalle interno");
  });
});

describe("US-145: la ruta del cron y la regla de pruebas", () => {
  it("proxy.ts no intercepta /api/ventas/consolidar (no la manda al login)", () => {
    const paneles = config.matcher.map((patron) => patron.replace("/:path*", ""));
    expect(paneles.some((prefijo) => "/api/ventas/consolidar".startsWith(prefijo))).toBe(false);
    expect(paneles.every((prefijo) => ["/admin", "/mesero", "/cocina", "/caja"].includes(prefijo))).toBe(true);
  });
  it("los prefijos de pedidos de prueba en SQL son los mismos que en US-111", () => {
    const archivo = readdirSync(MIGRACIONES).find((nombre) => nombre.endsWith("_us145_ventas_diarias.sql"));
    expect(archivo).toBeDefined();
    const sql = readFileSync(join(MIGRACIONES, archivo!), "utf8");
    const lista = /select array\[([^\]]+)\]::text\[\];/.exec(sql)?.[1] ?? "";
    const prefijosSql = [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(prefijosSql).toEqual(PREFIJOS_PRUEBA);
  });
});
