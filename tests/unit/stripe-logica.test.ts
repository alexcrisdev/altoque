import { describe, expect, it } from "vitest";
import {
  esSesionStripe,
  interpretarSesionPagada,
  leerMetadatosCheckout,
  leerRetornoPago,
  mensajeErrorStripe,
  metadatosCheckout,
  MINIMO_STRIPE_CENTIMOS,
  nombreLineaCheckout,
  validarMontoCheckout,
  type SesionCheckoutRecibida,
} from "../../src/features/pago-cierre/stripe-logica";

const CUENTA = "11111111-2222-4333-8444-555555555555";
const RESTAURANTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function sesion(cambios: Partial<SesionCheckoutRecibida> = {}): SesionCheckoutRecibida {
  return {
    id: "cs_test_a1B2c3D4e5",
    payment_status: "paid",
    currency: "pen",
    amount_total: 6200,
    payment_intent: "pi_3AbCdEfGhIjK",
    metadata: { tipo: "MESA", cuenta_id: CUENTA, restaurante_id: RESTAURANTE },
    ...cambios,
  };
}

describe("validarMontoCheckout", () => {
  it("acepta un saldo desde el mínimo de Stripe", () => {
    expect(validarMontoCheckout(MINIMO_STRIPE_CENTIMOS)).toBeNull();
    expect(validarMontoCheckout(6200)).toBeNull();
  });

  it("rechaza una cuenta sin saldo", () => {
    expect(validarMontoCheckout(0)).toMatch(/no tiene saldo/);
    expect(validarMontoCheckout(-500)).toMatch(/no tiene saldo/);
  });

  it("rechaza montos menores a S/ 2.00 y montos no enteros", () => {
    expect(validarMontoCheckout(199)).toMatch(/desde S\/ 2\.00/);
    expect(validarMontoCheckout(12.5)).toMatch(/no tiene saldo/);
  });
});

describe("metadatos de Checkout", () => {
  it("ida y vuelta: lo que se manda a Stripe se puede leer en el webhook", () => {
    const metadatos = metadatosCheckout({ tipo: "PARA_LLEVAR", id: CUENTA }, RESTAURANTE);
    expect(leerMetadatosCheckout(metadatos)).toEqual({
      cuenta: { tipo: "PARA_LLEVAR", id: CUENTA },
      restauranteId: RESTAURANTE,
    });
  });

  it("rechaza metadatos incompletos o alterados", () => {
    expect(leerMetadatosCheckout(null)).toBeNull();
    expect(leerMetadatosCheckout({ tipo: "MESA", cuenta_id: "no-es-uuid", restaurante_id: RESTAURANTE })).toBeNull();
    expect(leerMetadatosCheckout({ tipo: "OTRO", cuenta_id: CUENTA, restaurante_id: RESTAURANTE })).toBeNull();
    expect(leerMetadatosCheckout({ tipo: "MESA", cuenta_id: CUENTA })).toBeNull();
  });
});

describe("interpretarSesionPagada", () => {
  it("acepta una sesión pagada en soles", () => {
    expect(interpretarSesionPagada(sesion())).toEqual({
      ok: true,
      sesionStripe: "cs_test_a1B2c3D4e5",
      intentoPago: "pi_3AbCdEfGhIjK",
      cuenta: { tipo: "MESA", id: CUENTA },
      restauranteId: RESTAURANTE,
      montoCentimos: 6200,
    });
  });

  it("acepta el PaymentIntent expandido como objeto", () => {
    const resultado = interpretarSesionPagada(sesion({ payment_intent: { id: "pi_3AbCdEfGhIjK" } }));
    expect(resultado.ok && resultado.intentoPago).toBe("pi_3AbCdEfGhIjK");
  });

  it.each([
    ["sesión sin pagar (método diferido)", { payment_status: "unpaid" }, "NO_PAGADA"],
    ["otra moneda", { currency: "usd" }, "MONEDA"],
    ["sin monto", { amount_total: null }, "MONTO"],
    ["monto cero", { amount_total: 0 }, "MONTO"],
    ["sin PaymentIntent", { payment_intent: null }, "SIN_INTENTO"],
    ["PaymentIntent con formato raro", { payment_intent: "pi_x" }, "SIN_INTENTO"],
    ["sin metadatos", { metadata: null }, "METADATOS"],
    ["ID de sesión inválido", { id: "evt_123" }, "SESION_INVALIDA"],
  ] as const)("rechaza: %s", (_caso, cambios, motivo) => {
    expect(interpretarSesionPagada(sesion(cambios as Partial<SesionCheckoutRecibida>))).toEqual({ ok: false, motivo });
  });
});

describe("retorno desde Stripe", () => {
  it("muestra «Procesando» solo con un ID de sesión válido", () => {
    expect(leerRetornoPago("procesando", "cs_test_a1B2c3D4e5")).toBe("PROCESANDO");
    expect(leerRetornoPago("procesando", "inventado")).toBeNull();
    expect(leerRetornoPago("procesando", undefined)).toBeNull();
  });

  it("reconoce el pago cancelado e ignora valores desconocidos", () => {
    expect(leerRetornoPago("cancelado", undefined)).toBe("CANCELADO");
    expect(leerRetornoPago("exito", "cs_test_a1B2c3D4e5")).toBeNull();
  });

  it("valida el formato del ID de sesión", () => {
    expect(esSesionStripe("cs_live_ABC123")).toBe(true);
    expect(esSesionStripe("cs_test_")).toBe(false);
    expect(esSesionStripe("cs_test_abc;drop")).toBe(false);
  });
});

describe("textos", () => {
  it("nombra la línea según la cuenta", () => {
    expect(nombreLineaCheckout({ tipo: "MESA", id: CUENTA }, 3)).toBe("Cuenta de la mesa 3");
    expect(nombreLineaCheckout({ tipo: "PARA_LLEVAR", id: CUENTA }, null)).toBe("Pedido para llevar");
  });

  it("da un mensaje claro para cada error y uno genérico para lo desconocido", () => {
    expect(mensajeErrorStripe("NOTHING_TO_PAY")).toMatch(/no tiene saldo/);
    expect(mensajeErrorStripe("STRIPE_NOT_CONFIGURED")).toMatch(/Paga en caja/);
    expect(mensajeErrorStripe("ALGO_RARO")).toBe(mensajeErrorStripe("STRIPE_ERROR"));
  });
});
