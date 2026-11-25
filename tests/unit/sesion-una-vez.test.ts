import { beforeEach, describe, expect, it, vi } from "vitest";

// US-106 (Fase C): la sesión se consulta una vez por carga y un acceso denegado queda
// registrado con ruta, roles y hora (sin correo ni id del usuario).

vi.mock("server-only", () => ({}));
const peticion = vi.hoisted(() => ({ memoria: new Map<unknown, unknown>(), ruta: "/caja/mesa/1" as string | null }));
// `cache` de React guarda un valor por petición en el servidor de Next; aquí, una petición.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  cache: (fn: () => unknown) => () => {
    if (!peticion.memoria.has(fn)) peticion.memoria.set(fn, fn());
    return peticion.memoria.get(fn);
  },
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); }) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers(peticion.ruta ? { "x-altoque-ruta": peticion.ruta } : {})) }));
const supabase = vi.hoisted(() => ({
  getUser: vi.fn(),
  membresias: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    auth: { getUser: supabase.getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: supabase.membresias }) }) }),
  })),
}));

import { obtenerSesion, requerirPanel, requerirRol } from "../../src/features/auth/sesion";

beforeEach(() => {
  peticion.memoria.clear();
  peticion.ruta = "/caja/mesa/1";
  supabase.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "mesero@demo.altoque.pe" } } });
  supabase.membresias.mockReset().mockResolvedValue({ data: [{ restaurant_id: "r1", branch_id: null, roles: { code: "WAITER" } }], error: null });
});

describe("US-106 (Fase C): sesión una vez por carga", () => {
  it("menú, página y acciones de la misma carga comparten una sola consulta", async () => {
    await Promise.all([obtenerSesion(), requerirRol(["WAITER"]), requerirPanel("mesero"), requerirPanel("mesero")]);
    expect(supabase.getUser).toHaveBeenCalledTimes(1);
    expect(supabase.membresias).toHaveBeenCalledTimes(1);
  });
  it("en otra carga se vuelve a consultar", async () => {
    await obtenerSesion();
    peticion.memoria.clear();
    await obtenerSesion();
    expect(supabase.getUser).toHaveBeenCalledTimes(2);
  });
});

describe("US-106 (Fase C): acceso denegado registrado", () => {
  it("un mesero en /caja va a /sin-acceso y queda registrado sin datos personales", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(requerirPanel("caja")).rejects.toThrow("REDIRECT /sin-acceso");
    expect(aviso).toHaveBeenCalledTimes(1);
    const entrada = JSON.parse(String(aviso.mock.calls[0][0]));
    expect(entrada).toMatchObject({ evento: "acceso_denegado", ruta: "/caja/mesa/1", roles: ["WAITER"] });
    expect(Object.keys(entrada).sort()).toEqual(["evento", "hora", "roles", "ruta"]);
    expect(String(aviso.mock.calls[0][0])).not.toContain("mesero@demo.altoque.pe");
    expect(String(aviso.mock.calls[0][0])).not.toContain("u1");
    aviso.mockRestore();
  });
  it("sin sesión va al login y no es un acceso denegado", async () => {
    supabase.getUser.mockResolvedValue({ data: { user: null } });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(requerirPanel("caja")).rejects.toThrow("REDIRECT /login");
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });
});
