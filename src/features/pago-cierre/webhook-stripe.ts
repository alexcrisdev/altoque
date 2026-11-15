import "server-only";

import type Stripe from "stripe";
import { crearClienteStripe } from "./stripe";
import {
  actualizarEstadoReembolsoCheckout, finalizarReembolsoCheckout, obtenerCheckoutStripe,
  prepararReembolsoCheckout, registrarPagoStripe,
} from "./pago-online";
import { EVENTOS_PAGO_STRIPE, interpretarSesionPagada, type SesionCheckoutRecibida } from "./stripe-logica";

// US-076: qué hacer con un evento de Stripe YA VERIFICADO (firma correcta).
// Respuestas: 200 = Stripe no reintenta; 500 = Stripe reintenta más tarde.
// pagoNuevo: id del pago recién registrado (US-086 avisa a n8n solo en ese caso).
export type RespuestaWebhook = { estado: 200 | 500; detalle: string; pagoNuevo?: string };

// Errores de negocio: reintentar no los arregla. Stripe ya cobró, así que se
// deja en el log para devolver el dinero desde el dashboard de Stripe.
const REQUIEREN_REEMBOLSO = new Set([
  "AMOUNT_EXCEEDS_BALANCE", "ACCOUNT_NOT_FOUND", "ACCOUNT_CLOSED", "INVALID_PAYMENT", "CHECKOUT_STALE",
]);

type EstadoSolicitudReembolso = "CONFIRMADO" | "PENDIENTE" | "FALLIDO";

async function reembolsarCheckout(sesionStripe: string, intentoPago: string): Promise<EstadoSolicitudReembolso> {
  const estado = await prepararReembolsoCheckout(sesionStripe);
  if (estado.alreadyRefunded) return "CONFIRMADO";
  let reembolso: Stripe.Refund;
  try {
    reembolso = await crearClienteStripe().refunds.create({
      payment_intent: intentoPago,
      metadata: {
        checkout_id: estado.id, refund_attempt: String(estado.attempt), motivo: "US-097-checkout-obsoleto",
      },
    }, { idempotencyKey: `altoque-us097-refund-${estado.id}-${estado.attempt}` });
  } catch (error) {
    const codigo = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code : "STRIPE_REFUND_ERROR";
    // Ante una respuesta ambigua conservamos el mismo intento y clave Stripe:
    // un reintento de red no debe crear un segundo reembolso.
    await finalizarReembolsoCheckout(sesionStripe, null, `PENDING:${codigo}`);
    return "FALLIDO";
  }
  if (reembolso.status === "succeeded") {
    await finalizarReembolsoCheckout(sesionStripe, reembolso.id, null);
    return "CONFIRMADO";
  }
  if (reembolso.status === "pending" || reembolso.status === "requires_action") {
    await finalizarReembolsoCheckout(sesionStripe, reembolso.id, "PENDING");
    return "PENDIENTE";
  }
  await finalizarReembolsoCheckout(
    sesionStripe, reembolso.id, `FAILED:${reembolso.failure_reason ?? reembolso.status ?? "REFUND_FAILED"}`,
  );
  return "FALLIDO";
}

export async function procesarEventoStripe(evento: Pick<Stripe.Event, "id" | "type" | "data">): Promise<RespuestaWebhook> {
  if (evento.type === "refund.updated") {
    const reembolso = evento.data.object as Stripe.Refund;
    const checkoutId = reembolso.metadata?.checkout_id;
    const intentoReembolso = Number(reembolso.metadata?.refund_attempt);
    if (!checkoutId || !Number.isSafeInteger(intentoReembolso) || intentoReembolso < 1 || !reembolso.id || !reembolso.status) {
      return { estado: 200, detalle: "reembolso sin identificacion AlToque" };
    }
    await actualizarEstadoReembolsoCheckout(
      checkoutId, intentoReembolso, reembolso.id, reembolso.status, reembolso.failure_reason ?? null,
    );
    return { estado: 200, detalle: `estado reembolso: ${reembolso.status}` };
  }
  if (!(EVENTOS_PAGO_STRIPE as readonly string[]).includes(evento.type)) {
    return { estado: 200, detalle: `ignorado: ${evento.type}` };
  }

  const sesion = evento.data.object as unknown as SesionCheckoutRecibida;
  const datos = interpretarSesionPagada(sesion);
  if (!datos.ok) {
    // Pago diferido todavía sin pagar: llegará checkout.session.async_payment_succeeded.
    if (datos.motivo === "NO_PAGADA") return { estado: 200, detalle: "esperando pago" };
    console.error(`[stripe] evento ${evento.id} rechazado: ${datos.motivo}`);
    return { estado: 200, detalle: `rechazado: ${datos.motivo}` };
  }

  const checkout = await obtenerCheckoutStripe(datos.sesionStripe);
  if (!checkout || checkout.id !== datos.checkoutId
    || checkout.restaurantId !== datos.restauranteId
    || checkout.amountCentimos !== datos.montoCentimos
    || checkout.tableSessionId !== (datos.cuenta.tipo === "MESA" ? datos.cuenta.id : null)
    || checkout.orderId !== (datos.cuenta.tipo === "PARA_LLEVAR" ? datos.cuenta.id : null)) {
    console.error(`[stripe] evento ${evento.id} no coincide con el Checkout guardado`);
    return { estado: 200, detalle: "checkout no reconocido" };
  }

  const resultado = await registrarPagoStripe(datos);
  if (resultado.ok) {
    return resultado.duplicado
      ? { estado: 200, detalle: "ya registrado" }
      : { estado: 200, detalle: "registrado", pagoNuevo: resultado.pagoId };
  }
  if (REQUIEREN_REEMBOLSO.has(resultado.codigo)) {
    const estadoReembolso = await reembolsarCheckout(datos.sesionStripe, datos.intentoPago);
    if (estadoReembolso === "FALLIDO") {
      console.error(`[stripe] reembolso pendiente: ${datos.sesionStripe} -> ${resultado.codigo}`);
      return { estado: 500, detalle: "reembolso pendiente" };
    }
    return {
      estado: 200,
      detalle: estadoReembolso === "CONFIRMADO"
        ? `reembolsado: ${resultado.codigo}` : `reembolso pendiente: ${resultado.codigo}`,
    };
  }
  // Falla temporal (base caída, red): Stripe vuelve a intentar.
  console.error(`[stripe] no se pudo registrar ${datos.sesionStripe}: ${resultado.codigo}`);
  return { estado: 500, detalle: "error temporal" };
}
