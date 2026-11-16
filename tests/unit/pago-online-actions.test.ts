import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const crearSesion = vi.fn();
vi.mock("../../src/features/pago-cierre/stripe", () => ({
  stripeConfigurado: vi.fn(() => true),
  crearClienteStripe: () => ({ checkout: { sessions: { create: crearSesion } } }),
}));
vi.mock("../../src/features/pago-cierre/pago-online", () => ({
  resolverCuentaOnline: vi.fn(), iniciarRegistroCheckoutStripe: vi.fn(),
  vincularCheckoutStripe: vi.fn(), cancelarCheckoutStripe: vi.fn(),
}));

import {
  cancelarCheckoutStripe, iniciarRegistroCheckoutStripe, resolverCuentaOnline, vincularCheckoutStripe,
} from "../../src/features/pago-cierre/pago-online";
import { stripeConfigurado } from "../../src/features/pago-cierre/stripe";
import { iniciarPagoTarjetaAction } from "../../src/features/pago-cierre/pago-online-actions";

const SESION_MESA = "11111111-2222-4333-8444-555555555555";
const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHECKOUT = "cccccccc-dddd-4eee-8fff-000000000001";

function cuentaMesa(saldoCentimos: number) {
  return {
    cuenta: { tipo: "MESA" as const, id: SESION_MESA },
    restauranteId: RESTAURANTE,
    restauranteNombre: "Cevichería Demo",
    mesaNumero: 3,
    saldoCentimos,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(stripeConfigurado).mockReturnValue(true);
  vi.mocked(iniciarRegistroCheckoutStripe).mockResolvedValue({
    id: CHECKOUT, amountCentimos: 6200, expiresAt: new Date(Date.now() + 31 * 60_000).toISOString(),
  });
  vi.mocked(vincularCheckoutStripe).mockResolvedValue(undefined);
  vi.mocked(cancelarCheckoutStripe).mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_APP_URL = "https://altoque.test";
});

describe("iniciarPagoTarjetaAction", () => {
  it("guarda el correo voluntario solo en metadata de la sesión, sin pedirlo ni copiarlo al PaymentIntent", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(6200));
    crearSesion.mockResolvedValue({ id: "cs_test_correo", url: "https://checkout.stripe.com/x" });
    await iniciarPagoTarjetaAction("tok_mesa", null, " cliente@example.test ");
    const parametros = crearSesion.mock.calls[0][0];
    expect(parametros.metadata.receipt_email).toBe("cliente@example.test");
    expect(parametros.metadata.checkout_id).toBe(CHECKOUT);
    expect(parametros.payment_intent_data.metadata.checkout_id).toBe(CHECKOUT);
    expect(parametros.payment_intent_data.metadata).not.toHaveProperty("receipt_email");
    expect(parametros).not.toHaveProperty("customer_email");
  });
  it("un correo inválido no crea un Checkout", async () => {
    expect((await iniciarPagoTarjetaAction("tok", null, "invalido")).ok).toBe(false);
    expect(crearSesion).not.toHaveBeenCalled();
  });
  it("crea la sesión de Stripe con el saldo de la base, en soles", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(6200));
    crearSesion.mockResolvedValue({ id: "cs_test_x", url: "https://checkout.stripe.com/c/pay/cs_test_x" });

    const resultado = await iniciarPagoTarjetaAction("tok_mesa", null);

    expect(resultado).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_x" });
    const params = crearSesion.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data).toMatchObject({ currency: "pen", unit_amount: 6200 });
    expect(params.line_items[0].price_data.product_data.name).toBe("Cuenta de la mesa 3");
    expect(params.metadata).toEqual({ tipo: "MESA", cuenta_id: SESION_MESA, restaurante_id: RESTAURANTE, checkout_id: CHECKOUT });
    expect(params.success_url).toBe("https://altoque.test/m/tok_mesa?pago=procesando&sesion={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://altoque.test/m/tok_mesa?pago=cancelado");
    expect(params).not.toHaveProperty("payment_method_types");
    expect(iniciarRegistroCheckoutStripe).toHaveBeenCalledExactlyOnceWith({ tipo: "MESA", id: SESION_MESA });
    expect(vincularCheckoutStripe).toHaveBeenCalledExactlyOnceWith(CHECKOUT, "cs_test_x");
  });

  it("no acepta un monto del navegador: solo recibe token y clave", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(6200));
    crearSesion.mockResolvedValue({ id: "cs_test_x", url: "https://checkout.stripe.com/x" });

    // Aunque alguien intente mandar algo más, la acción solo usa token y clave.
    await (iniciarPagoTarjetaAction as (...args: unknown[]) => Promise<unknown>)("tok_mesa", null, null, 100);

    expect(crearSesion.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(6200);
  });

  it("rechaza una cuenta que no se pudo resolver desde el QR", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(null);
    const resultado = await iniciarPagoTarjetaAction("tok_falso", null);
    expect(resultado).toEqual({ ok: false, mensaje: expect.stringMatching(/ya no está abierta/) });
    expect(crearSesion).not.toHaveBeenCalled();
  });

  it("rechaza saldo cero y montos menores al mínimo sin llamar a Stripe", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(0));
    vi.mocked(iniciarRegistroCheckoutStripe).mockResolvedValue({ id: CHECKOUT, amountCentimos: 0, expiresAt: new Date().toISOString() });
    expect(await iniciarPagoTarjetaAction("tok", null)).toEqual({ ok: false, mensaje: expect.stringMatching(/no tiene saldo/) });
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(150));
    expect(await iniciarPagoTarjetaAction("tok", null)).toEqual({ ok: false, mensaje: expect.stringMatching(/desde S\/ 2\.00/) });
    expect(crearSesion).not.toHaveBeenCalled();
    expect(iniciarRegistroCheckoutStripe).not.toHaveBeenCalled();
  });

  it("avisa si Stripe no está configurado", async () => {
    vi.mocked(stripeConfigurado).mockReturnValue(false);
    expect(await iniciarPagoTarjetaAction("tok", null)).toEqual({ ok: false, mensaje: expect.stringMatching(/Paga en caja/) });
    expect(resolverCuentaOnline).not.toHaveBeenCalled();
  });

  it("no muestra errores internos si Stripe o la base fallan", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(6200));
    crearSesion.mockRejectedValue(new Error("Invalid API Key provided: sk_test_***"));
    const resultado = await iniciarPagoTarjetaAction("tok", null);
    expect(resultado).toEqual({ ok: false, mensaje: expect.stringMatching(/No pudimos abrir el pago/) });

    vi.mocked(resolverCuentaOnline).mockRejectedValue(new Error("db caída"));
    expect(await iniciarPagoTarjetaAction("tok", null)).toEqual({ ok: false, mensaje: expect.stringMatching(/No pudimos abrir el pago/) });
  });

  it("conserva el intento si Stripe creó el Checkout pero falló el primer enlace", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(cuentaMesa(6200));
    crearSesion.mockResolvedValue({ id: "cs_test_x", url: "https://checkout.stripe.com/x" });
    vi.mocked(vincularCheckoutStripe).mockRejectedValueOnce(new Error("fallo temporal de base"));

    expect(await iniciarPagoTarjetaAction("tok", null)).toMatchObject({ ok: false });
    expect(vincularCheckoutStripe).toHaveBeenCalledTimes(2);
    expect(cancelarCheckoutStripe).not.toHaveBeenCalled();
  });

  it("rechaza parámetros que no son texto", async () => {
    expect((await iniciarPagoTarjetaAction(123, null)).ok).toBe(false);
    expect((await iniciarPagoTarjetaAction("tok", 5)).ok).toBe(false);
    expect(resolverCuentaOnline).not.toHaveBeenCalled();
  });
});
