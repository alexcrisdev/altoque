import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/pago-cierre/pago-online", () => ({
  actualizarEstadoReembolsoCheckout: vi.fn(), registrarPagoStripe: vi.fn(), obtenerCheckoutStripe: vi.fn(), prepararReembolsoCheckout: vi.fn(),
  finalizarReembolsoCheckout: vi.fn(),
}));
vi.mock("../../src/features/pago-cierre/aviso-n8n", () => ({ programarAvisoPago: vi.fn() }));
import { programarAvisoPago } from "../../src/features/pago-cierre/aviso-n8n";

import {
  actualizarEstadoReembolsoCheckout, finalizarReembolsoCheckout, obtenerCheckoutStripe,
  prepararReembolsoCheckout, registrarPagoStripe,
} from "../../src/features/pago-cierre/pago-online";
import { crearClienteStripe } from "../../src/features/pago-cierre/stripe";
import { POST } from "../../src/app/api/stripe/webhook/route";
import { etiquetaMetodoPago } from "../../src/features/pago-cierre/cuenta-logica";

const SECRETO = "whsec_prueba_unitaria";
const CUENTA = "11111111-2222-4333-8444-555555555555";
const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHECKOUT = "cccccccc-dddd-4eee-8fff-000000000001";
const stripe = new Stripe("sk_test_prueba_unitaria");
process.env.STRIPE_SECRET_KEY = "sk_test_prueba_unitaria";
const refundCreate = vi.spyOn(crearClienteStripe().refunds, "create");

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
        metadata: { tipo: "MESA", cuenta_id: CUENTA, restaurante_id: RESTAURANTE, checkout_id: CHECKOUT },
        ...cambios,
      },
    },
  });
}

function eventoReembolso(status: string) {
  return JSON.stringify({
    id: "evt_refund_test", object: "event", type: "refund.updated",
    data: { object: {
      id: "re_test_123", object: "refund", status, failure_reason: status === "failed" ? "declined" : null,
      metadata: { checkout_id: CHECKOUT, refund_attempt: "1" },
    } },
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
  vi.mocked(obtenerCheckoutStripe).mockResolvedValue({
    id: CHECKOUT, sessionId: "cs_test_a1B2c3D4e5", restaurantId: RESTAURANTE,
    tableSessionId: CUENTA, orderId: null, orderIds: ["order-original"], amountCentimos: 6200,
    status: "OPEN", expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  vi.mocked(prepararReembolsoCheckout).mockResolvedValue({ id: CHECKOUT, attempt: 1, alreadyRefunded: false });
  vi.mocked(finalizarReembolsoCheckout).mockResolvedValue(undefined);
  vi.mocked(actualizarEstadoReembolsoCheckout).mockResolvedValue(undefined);
  refundCreate.mockReset();
  refundCreate.mockResolvedValue({ id: "re_test_123", status: "succeeded" } as Awaited<ReturnType<typeof refundCreate>>);
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
      checkoutId: CHECKOUT,
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

  it("si la cuenta cambió, solicita y registra el reembolso", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "AMOUNT_EXCEEDS_BALANCE" });
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(respuesta.status).toBe(200);
    expect(refundCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_3AbCdEfGhIjK" }), {
      idempotencyKey: `altoque-us097-refund-${CHECKOUT}-1`,
    });
    expect(finalizarReembolsoCheckout).toHaveBeenCalledWith("cs_test_a1B2c3D4e5", "re_test_123", null);
  });

  it("valida que el registro guardado coincida con los metadatos y el importe", async () => {
    vi.mocked(obtenerCheckoutStripe).mockResolvedValueOnce({
      id: CHECKOUT, sessionId: "cs_test_a1B2c3D4e5", restaurantId: RESTAURANTE,
      tableSessionId: CUENTA, orderId: null, orderIds: ["order-original"], amountCentimos: 5000,
      status: "OPEN", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(await respuesta.json()).toMatchObject({ detalle: "checkout no reconocido" });
    expect(registrarPagoStripe).not.toHaveBeenCalled();
  });

  it("deja registrado el fallo de reembolso para que un evento reintentado vuelva a intentarlo", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "CHECKOUT_STALE" });
    refundCreate.mockRejectedValueOnce(Object.assign(new Error("fallo"), { code: "api_error" }));
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(500);
    expect(finalizarReembolsoCheckout).toHaveBeenCalledWith("cs_test_a1B2c3D4e5", null, "PENDING:api_error");

    vi.mocked(prepararReembolsoCheckout).mockResolvedValueOnce({ id: CHECKOUT, attempt: 1, alreadyRefunded: false });
    refundCreate.mockResolvedValueOnce({ id: "re_test_retry", status: "succeeded" } as Awaited<ReturnType<typeof refundCreate>>);
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(200);
    expect(refundCreate).toHaveBeenLastCalledWith(expect.any(Object), { idempotencyKey: `altoque-us097-refund-${CHECKOUT}-1` });
  });

  it("guarda un reembolso rechazado por Stripe como fallido", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "CHECKOUT_STALE" });
    refundCreate.mockResolvedValueOnce({ id: "re_test_failed", status: "failed", failure_reason: "declined" } as Awaited<ReturnType<typeof refundCreate>>);
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(500);
    expect(finalizarReembolsoCheckout).toHaveBeenCalledWith("cs_test_a1B2c3D4e5", "re_test_failed", "FAILED:declined");
  });

  it("mantiene como pendiente un reembolso que Stripe aún está procesando", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "CHECKOUT_STALE" });
    refundCreate.mockResolvedValueOnce({ id: "re_test_pending", status: "pending" } as Awaited<ReturnType<typeof refundCreate>>);
    const respuesta = await POST(peticion(evento("checkout.session.completed")));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ detalle: "reembolso pendiente: CHECKOUT_STALE" });
    expect(finalizarReembolsoCheckout).toHaveBeenCalledWith("cs_test_a1B2c3D4e5", "re_test_pending", "PENDING");
  });

  it("no repite un reembolso ya confirmado", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "CHECKOUT_STALE" });
    vi.mocked(prepararReembolsoCheckout).mockResolvedValueOnce({ id: CHECKOUT, attempt: 1, alreadyRefunded: true });
    expect((await POST(peticion(evento("checkout.session.completed")))).status).toBe(200);
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("guarda cambios posteriores de estado del reembolso enviados por Stripe", async () => {
    const respuesta = await POST(peticion(eventoReembolso("failed")));
    expect(respuesta.status).toBe(200);
    expect(actualizarEstadoReembolsoCheckout).toHaveBeenCalledWith(CHECKOUT, 1, "re_test_123", "failed", "declined");
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

describe("POST /api/stripe/webhook: aviso a n8n US-086", () => {
  it("avisa solo cuando registra un pago nuevo", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: true, pagoId: "p1", duplicado: false });
    await POST(peticion(evento("checkout.session.completed")));
    expect(programarAvisoPago).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("si Stripe reenvía el evento no vuelve a avisar", async () => {
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: true, pagoId: "p1", duplicado: true });
    await POST(peticion(evento("checkout.session.completed")));
    expect(programarAvisoPago).not.toHaveBeenCalled();
  });

  it("sin firma válida o con error temporal no avisa", async () => {
    await POST(peticion(evento("checkout.session.completed"), "t=1,v1=firmafalsa"));
    vi.mocked(registrarPagoStripe).mockResolvedValue({ ok: false, codigo: "" });
    await POST(peticion(evento("checkout.session.completed")));
    expect(programarAvisoPago).not.toHaveBeenCalled();
  });
});
