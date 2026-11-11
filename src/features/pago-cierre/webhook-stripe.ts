import "server-only";

import type Stripe from "stripe";
import { registrarPagoStripe } from "./pago-online";
import { EVENTOS_PAGO_STRIPE, interpretarSesionPagada, type SesionCheckoutRecibida } from "./stripe-logica";

// US-076: qué hacer con un evento de Stripe YA VERIFICADO (firma correcta).
// Respuestas: 200 = Stripe no reintenta; 500 = Stripe reintenta más tarde.
// pagoNuevo: id del pago recién registrado (US-086 avisa a n8n solo en ese caso).
export type RespuestaWebhook = { estado: 200 | 500; detalle: string; pagoNuevo?: string };

// Errores de negocio: reintentar no los arregla. Stripe ya cobró, así que se
// deja en el log para devolver el dinero desde el dashboard de Stripe.
const REQUIEREN_REEMBOLSO = new Set(["AMOUNT_EXCEEDS_BALANCE", "ACCOUNT_NOT_FOUND", "ACCOUNT_CLOSED", "INVALID_PAYMENT"]);

export async function procesarEventoStripe(evento: Pick<Stripe.Event, "id" | "type" | "data">): Promise<RespuestaWebhook> {
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

  const resultado = await registrarPagoStripe(datos);
  if (resultado.ok) {
    return resultado.duplicado
      ? { estado: 200, detalle: "ya registrado" }
      : { estado: 200, detalle: "registrado", pagoNuevo: resultado.pagoId };
  }
  if (REQUIEREN_REEMBOLSO.has(resultado.codigo)) {
    console.error(`[stripe] REQUIERE REEMBOLSO: ${datos.sesionStripe} (${datos.intentoPago}) -> ${resultado.codigo}`);
    return { estado: 200, detalle: `requiere reembolso: ${resultado.codigo}` };
  }
  // Falla temporal (base caída, red): Stripe vuelve a intentar.
  console.error(`[stripe] no se pudo registrar ${datos.sesionStripe}: ${resultado.codigo}`);
  return { estado: 500, detalle: "error temporal" };
}
