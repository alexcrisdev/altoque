import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import { after } from "next/server";
import {
  agruparPlatos,
  cabecerasAviso,
  configuracionN8n,
  construirAvisoPago,
  firmarAviso,
  type DatosPagoConfirmado,
} from "../../src/features/pago-cierre/aviso-n8n-logica";
import { enviarAvisoPago, programarAvisoPago } from "../../src/features/pago-cierre/aviso-n8n";

// Valores ficticios: no se conecta a n8n ni a Supabase.
const SECRETO = "secreto-de-prueba-unitaria-de-32-caracteres";
const CONFIG = { url: "https://n8n.example.test/webhook/altoque-pago-confirmado", secreto: SECRETO };
const PAGO = "11111111-2222-4333-8444-555555555555";

const DATOS: DatosPagoConfirmado = {
  pagoId: PAGO,
  restauranteId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  restauranteNombre: "Cevichería Demo",
  cuenta: { tipo: "MESA", id: "99999999-8888-4777-8666-555555555555", mesa: 3 },
  metodo: "CASH",
  enLinea: false,
  montoCentimos: 6250,
  confirmadoEn: "2026-11-11T15:30:00.000Z",
  platos: [{ nombre: "Ceviche clásico", cantidad: 2, precioUnitarioCentimos: 3125, subtotalCentimos: 6250 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("configuración del aviso", () => {
  it("queda apagado si falta la URL o el secreto", () => {
    expect(configuracionN8n({})).toBeNull();
    expect(configuracionN8n({ N8N_WEBHOOK_URL: CONFIG.url })).toBeNull();
    expect(configuracionN8n({ N8N_WEBHOOK_SECRET: SECRETO })).toBeNull();
  });

  it("acepta HTTPS y localhost, rechaza HTTP público, credenciales y secretos cortos", () => {
    expect(configuracionN8n({ N8N_WEBHOOK_URL: CONFIG.url, N8N_WEBHOOK_SECRET: SECRETO })).toEqual(CONFIG);
    expect(configuracionN8n({ N8N_WEBHOOK_URL: "http://localhost:5678/webhook/x", N8N_WEBHOOK_SECRET: SECRETO })?.url)
      .toBe("http://localhost:5678/webhook/x");
    expect(() => configuracionN8n({ N8N_WEBHOOK_URL: "http://n8n.example.test/x", N8N_WEBHOOK_SECRET: SECRETO })).toThrow("HTTPS");
    expect(() => configuracionN8n({ N8N_WEBHOOK_URL: "https://u:p@n8n.example.test/x", N8N_WEBHOOK_SECRET: SECRETO })).toThrow("credenciales");
    expect(() => configuracionN8n({ N8N_WEBHOOK_URL: CONFIG.url, N8N_WEBHOOK_SECRET: "corto" })).toThrow("32");
  });
});

describe("firma HMAC", () => {
  it("firma '<timestamp>.<cuerpo>' con SHA-256 y el secreto compartido", () => {
    const cuerpo = '{"evento":"pago_confirmado"}';
    const esperada = createHmac("sha256", SECRETO).update(`1700000000.${cuerpo}`).digest("hex");
    expect(firmarAviso(cuerpo, SECRETO, 1700000000)).toBe(esperada);
  });

  it("cambia si cambia el cuerpo, la hora o el secreto", () => {
    const base = firmarAviso("{}", SECRETO, 1);
    expect(firmarAviso('{"a":1}', SECRETO, 1)).not.toBe(base);
    expect(firmarAviso("{}", SECRETO, 2)).not.toBe(base);
    expect(firmarAviso("{}", `${SECRETO}x`, 1)).not.toBe(base);
  });

  it("manda evento, hora y firma con prefijo sha256= en las cabeceras", () => {
    const cabeceras = cabecerasAviso("{}", SECRETO, 1700000000);
    expect(cabeceras).toMatchObject({
      "Content-Type": "application/json",
      "X-AlToque-Evento": "pago_confirmado",
      "X-AlToque-Timestamp": "1700000000",
    });
    expect(cabeceras["X-AlToque-Firma"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe("contenido del aviso", () => {
  it("lleva restaurante, cuenta, monto, método, fecha y platos con montos en texto", () => {
    expect(construirAvisoPago(DATOS)).toEqual({
      evento: "pago_confirmado",
      version: 1,
      id: PAGO,
      restaurante: { id: DATOS.restauranteId, nombre: "Cevichería Demo" },
      cuenta: { tipo: "MESA", id: DATOS.cuenta.id, mesa: 3, pedido: null },
      pago: { metodo: "CASH", canal: "CAJA", monto: "62.50", moneda: "PEN", confirmado_en: "2026-11-11T15:30:00.000Z" },
      platos: [{ nombre: "Ceviche clásico", cantidad: 2, precio_unitario: "31.25", subtotal: "62.50" }],
    });
  });

  it("marca Stripe como canal ONLINE y el para llevar con su número de pedido", () => {
    const aviso = construirAvisoPago({ ...DATOS, metodo: "CARD", enLinea: true, cuenta: { tipo: "PARA_LLEVAR", id: "p", pedido: 674 } });
    expect(aviso.pago).toMatchObject({ metodo: "CARD", canal: "ONLINE" });
    expect(aviso.cuenta).toMatchObject({ tipo: "PARA_LLEVAR", mesa: null, pedido: 674 });
  });

  it("no incluye teléfono, nombre del cliente, observaciones ni referencias", () => {
    const texto = JSON.stringify(construirAvisoPago(DATOS)).toLowerCase();
    for (const prohibido of ["phone", "telefono", "customer", "cliente", "observ", "referencia", "reference", "clave", "stripe_session"]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("une platos iguales de varios pedidos y los ordena", () => {
    const platos = agruparPlatos([
      { product_name: "Leche de tigre", quantity: 1, unit_price: "18.00", subtotal: "18.00" },
      { product_name: "Ceviche clásico", quantity: 1, unit_price: 31.25, subtotal: 31.25 },
      { product_name: "Ceviche clásico", quantity: 2, unit_price: "31.25", subtotal: "62.50" },
    ]);
    expect(platos).toEqual([
      { nombre: "Ceviche clásico", cantidad: 3, precioUnitarioCentimos: 3125, subtotalCentimos: 9375 },
      { nombre: "Leche de tigre", cantidad: 1, precioUnitarioCentimos: 1800, subtotalCentimos: 1800 },
    ]);
  });

  it("el JSON enviado vuelve a dar el mismo texto al leerlo y reescribirlo (n8n verifica así)", () => {
    const cuerpo = JSON.stringify(construirAvisoPago(DATOS));
    expect(JSON.stringify(JSON.parse(cuerpo))).toBe(cuerpo);
  });
});

describe("envío a n8n", () => {
  const leer = vi.fn(async () => DATOS);
  const ahora = () => 1700000000_000;

  it("envía un POST firmado que n8n puede verificar con el mismo secreto", async () => {
    const enviar = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await enviarAvisoPago(PAGO, CONFIG, { leer, enviar, ahora })).toBe(true);

    const [url, opciones] = enviar.mock.calls[0] as unknown as [string, RequestInit];
    const cabeceras = opciones.headers as Record<string, string>;
    expect(url).toBe(CONFIG.url);
    expect(opciones.method).toBe("POST");
    expect(cabeceras["X-AlToque-Timestamp"]).toBe("1700000000");
    expect(cabeceras["X-AlToque-Firma"]).toBe(`sha256=${firmarAviso(opciones.body as string, SECRETO, 1700000000)}`);
    expect(JSON.parse(opciones.body as string)).toMatchObject({ id: PAGO, pago: { monto: "62.50" } });
  });

  it("si n8n rechaza, devuelve false y deja el error en el log sin el secreto", async () => {
    const enviar = vi.fn(async () => new Response("no", { status: 401 }));
    expect(await enviarAvisoPago(PAGO, CONFIG, { leer, enviar, ahora })).toBe(false);
    const log = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(log).toContain("HTTP 401");
    expect(log).not.toContain(SECRETO);
  });

  it("si n8n no responde o la red falla, no lanza error (el pago ya está guardado)", async () => {
    const tiempo = Object.assign(new Error("lento"), { name: "TimeoutError" });
    await expect(enviarAvisoPago(PAGO, CONFIG, { leer, enviar: vi.fn().mockRejectedValue(tiempo), ahora })).resolves.toBe(false);
    await expect(enviarAvisoPago(PAGO, CONFIG, { leer, enviar: vi.fn().mockRejectedValue(new Error("red")), ahora })).resolves.toBe(false);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("sin respuesta en 5 s");
  });

  it("no envía nada si el pago no está confirmado", async () => {
    const enviar = vi.fn();
    expect(await enviarAvisoPago(PAGO, CONFIG, { leer: vi.fn(async () => null), enviar, ahora })).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("programar el aviso", () => {
  it("sin configuración no programa nada", () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    programarAvisoPago(PAGO);
    expect(after).not.toHaveBeenCalled();
  });

  it("con configuración lo deja para después de responder", () => {
    vi.stubEnv("N8N_WEBHOOK_URL", CONFIG.url);
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRETO);
    programarAvisoPago(PAGO);
    expect(after).toHaveBeenCalledOnce();
  });

  it("con configuración inválida avisa en el log y no rompe el cobro", () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://n8n.example.test/x");
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRETO);
    expect(() => programarAvisoPago(PAGO)).not.toThrow();
    expect(after).not.toHaveBeenCalled();
  });
});
