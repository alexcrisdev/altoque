import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser, Page } from "@playwright/test";
import { abrirDemo, configuracionDemo } from "../../scripts/abrir-demo.mjs";
import { destinosDemo, iniciarSesion } from "../e2e/sesion-demo.mjs";
import { createServerClient } from "@supabase/ssr";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

// Configuración deliberadamente ficticia: no se conecta a Supabase.
const entorno = {
  DEMO_PASSWORD: "valor-ficticio-unitaria", NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-publica-ficticia", E2E_MESA_TOKEN: "qr-ficticio",
};

describe("configuración de demo:abrir", () => {
  for (const nombre of ["DEMO_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    it(`explica qué configurar si falta ${nombre}`, () => {
      expect(() => configuracionDemo({ ...entorno, [nombre]: " " })).toThrow(nombre);
    });
  }
  it("usa localhost y el QR de mesa sin exponer su valor en errores", () => {
    expect(configuracionDemo(entorno)).toEqual({ baseURL: "http://localhost:3000", token: "qr-ficticio" });
    expect(() => configuracionDemo({ ...entorno, E2E_MESA_TOKEN: "https://privado.example/m/valor-privado" }))
      .toThrow("Configura solo su token");
  });
  it("admite el mostrador y el QR del seed cuando no se configuró mesa", () => {
    expect(configuracionDemo({ ...entorno, E2E_MESA_TOKEN: "", E2E_MOSTRADOR_TOKEN: "mostrador-ficticio" }).token).toBe("mostrador-ficticio");
    expect(configuracionDemo({ ...entorno, E2E_MESA_TOKEN: "" }).token).toBe("demo-mesa-1");
  });
  it("rechaza URL con credenciales y acepta otro origen de pruebas", () => {
    expect(() => configuracionDemo({ ...entorno, E2E_BASE_URL: "https://usuario:privado@example.test" })).toThrow("sin credenciales");
    expect(configuracionDemo({ ...entorno, E2E_BASE_URL: "https://pruebas.example.test/" }).baseURL).toBe("https://pruebas.example.test");
  });
});

function navegadorFalso() {
  let ruta = "/login";
  const waitFor = vi.fn().mockResolvedValue(undefined);
  const page = {
    goto: vi.fn(async (destino: string) => { ruta = destino; return { ok: () => true }; }),
    url: () => `http://localhost:3000${ruta}`,
    setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(),
    getByRole: vi.fn(() => ({ waitFor, first: () => ({ waitFor }) })),
  };
  const context = { newPage: vi.fn().mockResolvedValue(page) };
  const browser = { newContext: vi.fn().mockResolvedValue(context), close: vi.fn().mockResolvedValue(undefined) };
  return { page, context, browser, waitFor };
}

describe("apertura y recuperación de ventanas", () => {
  it("abre cinco navegadores separados, autentica cuatro roles y solo navega al QR para cliente", async () => {
    const ventanas = Array.from({ length: 5 }, navegadorFalso);
    let i = 0;
    const lanzar = vi.fn(async () => ventanas[i++].browser as unknown as Browser);
    const autenticar = vi.fn(async (page: Page, rol: keyof typeof destinosDemo) => { await page.goto(destinosDemo[rol]); });
    const informar = vi.fn();
    const browsers = await abrirDemo({ config: configuracionDemo(entorno), lanzar, autenticar, informar });
    expect(browsers).toHaveLength(5);
    expect(lanzar.mock.calls).toHaveLength(5);
    expect(autenticar.mock.calls.map(([, rol]) => rol)).toEqual(["mesero", "cocina", "caja", "admin"]);
    expect(ventanas[4].page.goto).toHaveBeenCalledExactlyOnceWith("/m/qr-ficticio");
    expect(ventanas.every(v => v.browser.newContext.mock.calls.length === 1)).toBe(true);
    expect(informar.mock.calls.flat().join(" ")).not.toContain(entorno.DEMO_PASSWORD);
  });
  it("cierra todas las ventanas parciales al fallar el segundo login", async () => {
    const ventanas = [navegadorFalso(), navegadorFalso()];
    let i = 0;
    const lanzar = vi.fn(async () => ventanas[i++].browser as unknown as Browser);
    const autenticar = vi.fn(async (page: Page, rol: keyof typeof destinosDemo) => {
      if (rol === "cocina") throw new Error("No se pudo iniciar la sesión demo de cocina.");
      await page.goto(destinosDemo[rol]);
    });
    await expect(abrirDemo({ config: configuracionDemo(entorno), lanzar, autenticar, informar: vi.fn() })).rejects.toThrow("cocina");
    expect(lanzar).toHaveBeenCalledTimes(2);
    for (const ventana of ventanas) expect(ventana.browser.close).toHaveBeenCalledOnce();
  });
  it("distingue la falta de Chromium sin filtrar errores internos", async () => {
    await expect(abrirDemo({ config: configuracionDemo(entorno), lanzar: vi.fn().mockRejectedValue(new Error("dato-interno")) }))
      .rejects.toThrow("npx playwright install chromium");
  });
});

describe("login compartido con E2E", () => {
  it("muestra el rol que falló y no revela el error del proveedor ni la contraseña", async () => {
    for (const [nombre, valor] of Object.entries(entorno)) vi.stubEnv(nombre, valor);
    vi.mocked(createServerClient).mockReturnValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: new Error("error-con-dato-privado") }) },
    } as unknown as ReturnType<typeof createServerClient>);
    const page = navegadorFalso().page as unknown as Page;
    await expect(iniciarSesion(page, "mesero")).rejects.toThrow("No se pudo iniciar la sesión demo de mesero");
    await expect(iniciarSesion(page, "cocina")).rejects.not.toThrow("error-con-dato-privado");
    expect(page.goto).not.toHaveBeenCalled();
  });
});
