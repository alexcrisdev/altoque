// US-076: reglas puras del pago online con Stripe (sin base de datos ni red),
// para poder probarlas. Todo en céntimos. La base vuelve a validar todo en
// registrar_pago_stripe.

import type { CuentaACobrar } from "./pago-logica";

export const MONEDA_STRIPE = "pen";

// Stripe exige que el total equivalga a US$ 0.50 o más (unos S/ 1.75).
// Se usa S/ 2.00 para tener margen si cambia el tipo de cambio.
export const MINIMO_STRIPE_CENTIMOS = 200;

// Eventos del webhook que confirman un pago de Checkout.
export const EVENTOS_PAGO_STRIPE = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESION_STRIPE = /^cs_(test|live)_[A-Za-z0-9]+$/;
const INTENTO_STRIPE = /^pi_[A-Za-z0-9]{8,64}$/;

export function esSesionStripe(texto: unknown): texto is string {
  return typeof texto === "string" && SESION_STRIPE.test(texto);
}

// El saldo lo calcula la base. Aquí solo se decide si se puede pagar online.
export function validarMontoCheckout(saldoCentimos: number): string | null {
  if (!Number.isInteger(saldoCentimos) || saldoCentimos <= 0) return "Esta cuenta no tiene saldo pendiente.";
  if (saldoCentimos < MINIMO_STRIPE_CENTIMOS) {
    return "El pago con tarjeta online es desde S/ 2.00. Para montos menores, paga en caja.";
  }
  return null;
}

export function nombreLineaCheckout(cuenta: CuentaACobrar, mesaNumero: number | null): string {
  return cuenta.tipo === "MESA"
    ? `Cuenta de la mesa ${mesaNumero ?? ""}`.trim()
    : "Pedido para llevar";
}

// Lo que viaja a Stripe y vuelve en el webhook para saber qué cuenta se pagó.
// Solo IDs internos: nunca datos del cliente.
export function metadatosCheckout(cuenta: CuentaACobrar, restauranteId: string): Record<string, string> {
  return { tipo: cuenta.tipo, cuenta_id: cuenta.id, restaurante_id: restauranteId };
}

export function leerMetadatosCheckout(
  metadatos: Record<string, string> | null | undefined,
): { cuenta: CuentaACobrar; restauranteId: string } | null {
  const tipo = metadatos?.tipo;
  const id = metadatos?.cuenta_id;
  const restauranteId = metadatos?.restaurante_id;
  if ((tipo !== "MESA" && tipo !== "PARA_LLEVAR") || !UUID.test(id ?? "") || !UUID.test(restauranteId ?? "")) {
    return null;
  }
  return { cuenta: { tipo, id: id as string }, restauranteId: restauranteId as string };
}

// Solo los campos de la sesión de Checkout que usa el webhook.
export type SesionCheckoutRecibida = {
  id: string;
  payment_status: string;
  currency: string | null;
  amount_total: number | null;
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
};

export type PagoStripeAceptado = {
  ok: true;
  sesionStripe: string;
  intentoPago: string;
  cuenta: CuentaACobrar;
  restauranteId: string;
  montoCentimos: number;
};

export type MotivoRechazoStripe = "SESION_INVALIDA" | "NO_PAGADA" | "MONEDA" | "MONTO" | "SIN_INTENTO" | "METADATOS";

// Decide si una sesión de Checkout ya pagada se puede registrar.
// "unpaid" puede pasar con métodos de pago diferidos: se espera al evento async.
export function interpretarSesionPagada(
  sesion: SesionCheckoutRecibida,
): PagoStripeAceptado | { ok: false; motivo: MotivoRechazoStripe } {
  if (!esSesionStripe(sesion.id)) return { ok: false, motivo: "SESION_INVALIDA" };
  if (sesion.payment_status !== "paid") return { ok: false, motivo: "NO_PAGADA" };
  if (sesion.currency !== MONEDA_STRIPE) return { ok: false, motivo: "MONEDA" };
  const monto = sesion.amount_total;
  if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) return { ok: false, motivo: "MONTO" };
  const intento = typeof sesion.payment_intent === "string" ? sesion.payment_intent : sesion.payment_intent?.id;
  if (!intento || !INTENTO_STRIPE.test(intento)) return { ok: false, motivo: "SIN_INTENTO" };
  const datos = leerMetadatosCheckout(sesion.metadata);
  if (!datos) return { ok: false, motivo: "METADATOS" };
  return { ok: true, sesionStripe: sesion.id, intentoPago: intento, ...datos, montoCentimos: monto };
}

// A dónde vuelve el cliente desde Stripe: la carta de la mesa o la página de su
// pedido para llevar. {CHECKOUT_SESSION_ID} lo reemplaza Stripe; no se codifica.
export function urlsRetornoCheckout(
  base: string,
  token: string,
  clave: string | null,
): { exito: string; cancelado: string } {
  const raiz = base.replace(/\/+$/, "");
  const pagina = clave
    ? `${raiz}/m/${encodeURIComponent(token)}/pedido/${encodeURIComponent(clave)}`
    : `${raiz}/m/${encodeURIComponent(token)}`;
  return {
    exito: `${pagina}?pago=procesando&sesion={CHECKOUT_SESSION_ID}`,
    cancelado: `${pagina}?pago=cancelado`,
  };
}

// Lo que se muestra al cliente al volver de Stripe (?pago=...).
export type EstadoRetornoPago = "PROCESANDO" | "CANCELADO" | null;

export function leerRetornoPago(pago: unknown, sesion: unknown): EstadoRetornoPago {
  if (pago === "cancelado") return "CANCELADO";
  if (pago === "procesando" && esSesionStripe(sesion)) return "PROCESANDO";
  return null;
}

const MENSAJES_ERROR_STRIPE: Record<string, string> = {
  NOTHING_TO_PAY: "Esta cuenta ya no tiene saldo pendiente.",
  BELOW_MINIMUM: "El pago con tarjeta online es desde S/ 2.00. Para montos menores, paga en caja.",
  ACCOUNT_NOT_FOUND: "La cuenta ya no está abierta. Pide ayuda al personal.",
  STRIPE_NOT_CONFIGURED: "El pago con tarjeta online no está disponible ahora. Paga en caja.",
  STRIPE_ERROR: "No pudimos abrir el pago con tarjeta. Inténtalo de nuevo o paga en caja.",
};

export function mensajeErrorStripe(codigo: string): string {
  return MENSAJES_ERROR_STRIPE[codigo] ?? MENSAJES_ERROR_STRIPE.STRIPE_ERROR;
}
