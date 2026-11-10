import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/pago-cierre/pago-online", () => ({ registrarPagoStripe: vi.fn() }));

import { registrarPagoStripe } from "../../src/features/pago-cierre/pago-online";
import { POST } from "../../src/app/api/stripe/webhook/route";
import { etiquetaMetodoPago } from "../../src/features/pago-cierre/cuenta-logica";

const SECRETO = "whsec_prueba_unitaria";
const CUENTA = "11111111-2222-4333-8444-555555555555";
const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const stripe = new Stripe("sk_test_prueba_unitaria");

function evento(tipo: string, cambios: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: tipo,
    data: {
      object: {
        id: "cs_test_a1B2c3D4e5",
        object: "checkout.session",
        payment_status: "paid",
        currency: "pen",
        amount_total: 6200,
        payment_intent: "pi_3AbCdEfGhIjK",
        metadata: { tipo: "MESA", cuenta_id: CUENTA, restaurante_id: RESTAURANTE },
        ...cambios,
      },
    },
  });
}

function peticion(cuerpo: string, firma: string | null = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: SECRETO })) {
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  if (firma !== null) cabeceras["stripe-signature"] = firma;
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body: cuerpo, headers: cabeceras });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.STRIPE_SECRET_KEY = "sk_test_prueba_unitaria";
  process.env.STRIPE_WEBHOOK_SECRET = SECRETO;
});

describe("POST /api/stripe/webhook: firma", () => {
  it("sin firma responde 400 y no toca la base", async () => {
    const respuesta = await POST(peticion(evento("checkout.session.completed"), null));
    expect(respuesta.status).toBe(400);
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("con firma falsa responde 400", async () => {
    const respuesta = await POST(peticion(evento("checkout.session.completed"), "t=1,v1=firmafalsa"));
    expect(respuesta.status).toBe(400);
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("firmado con otro secreto responde 400", async () => {
    const cuerpo = evento("checkout.session.completed");
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: "whsec_de_otro" });
    expect((await POST(peticion(cuerpo, firma))).status).toBe(400);
  });

  it("si alguien cambia el monto después de firmar, responde 400", async () => {
    const original = evento("checkout.session.completed");
    const firma = stripe.webhooks.generateTestHeaderString({ payload: original, secret: SECRETO });
    const alterado = original.replace("6200", "100");
    expect((await POST(peticion(alterado, firma))).status).toBe(400);
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("sin STRIPE_WEBHOOK_SECRET configurado responde 500", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(500);
  });
});

describe("POST /api/stripe/webhook: registro del pago", () => {
  it("registra el pago confirmado con los datos de Stripe", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: true, pagoId: "p1", duplicado: false });
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ detalle: "registrado" });
    expect(registrarPagoStripe).toHaveBeenCalledWith({
      ok: true,
      sesionStripe: "cs_test_a1B2c3D4e5",
      intentoPago: "pi_3AbCdEfGhIjK",
      cuenta: { tipo: "MESA", id: CUENTA },
      restauranteId: RESTAURANTE,
      montoCentimos: 6200,
    });
  });

  it("si Stripe reenvía el evento responde 200 sin duplicar", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: true, pagoId: "p1", duplicado: true });
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ detalle: "ya registrado" });
  });

  it("también registra el pago diferido (async_payment_succeeded)", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: true, pagoId: "p1", duplicado: false });
    expect((await POST(peticion(evento("checkout.session.async_payment_succeeded")))).status).toBe(200);
    expect(registrarPagoStripe).toHaveBeenCalledOnce();
  });

  it("una sesión aún sin pagar no se registra", async () => {
    const respuesta = await POST(peticion(evento("checkout.session.completed", { payment_status: "unpaid" })));
    expect(respuesta.status).toBe(200);
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("ignora otros eventos", async () => {
    const respuesta = await POST(peticion(evento("payment_intent.created")));
    expect(respuesta.status).toBe(200);
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("si la cuenta ya estaba pagada, responde 200 y avisa que requiere reembolso", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "AMOUNT_EXCEEDS_BALANCE" });
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(respuesta.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("REQUIERE REEMBOLSO"));
  });

  it("si la base falla, responde 500 para que Stripe reintente", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "ERROR" });
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(500);
    vi.mocked(registrarPagoStripe).mockRejectedValue(new Error("caída"));
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(500);
  });
});

describe("caja", () => {
  it("muestra «Stripe (online)» solo para pagos de Stripe", () => {
    expect(etiquetaMetodoPago({ metodo: "CARD", stripe: true })).toBe("Stripe (online)");
    expect(etiquetaMetodoPago({ metodo: "CARD", stripe: false })).toBe("Tarjeta");
    expect(etiquetaMetodoPago({ metodo: "YAPE" })).toBe("Yape");
  });
});
