"use server";

// US-076: acciones del pago con tarjeta online. Las usa el cliente desde su
// celular, sin iniciar sesión: todo se valida con el token del QR.

import { pagoStripeRegistrado, resolverCuentaOnline } from "./pago-online";
import { crearClienteStripe, stripeConfigurado } from "./stripe";
import {
  esSesionStripe,
  MONEDA_STRIPE,
  mensajeErrorStripe,
  metadatosCheckout,
  nombreLineaCheckout,
  urlsRetornoCheckout,
  validarMontoCheckout,
} from "./stripe-logica";

export type ResultadoInicioPago = { ok: true; url: string } | { ok: false; mensaje: string };

// Etiqueta para ver este flujo en el dashboard de Stripe.
const IDENTIFICADOR_INTEGRACION = "altoque_pago_qr_hfkwqzpe";
// Stripe pide que la sesión dure al menos 30 minutos.
const DURACION_SESION_SEGUNDOS = 31 * 60;

export async function iniciarPagoTarjetaAction(token: unknown, clave: unknown): Promise<ResultadoInicioPago> {
  if (typeof token !== "string" || (clave !== null && typeof clave !== "string")) {
    return { ok: false, mensaje: mensajeErrorStripe("ACCOUNT_NOT_FOUND") };
  }
  if (!stripeConfigurado()) return { ok: false, mensaje: mensajeErrorStripe("STRIPE_NOT_CONFIGURED") };

  let cuenta;
  try {
    cuenta = await resolverCuentaOnline(token, clave);
  } catch {
    return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
  }
  if (!cuenta) return { ok: false, mensaje: mensajeErrorStripe("ACCOUNT_NOT_FOUND") };

  // El monto es el saldo que calculó la base; el navegador no manda ningún monto.
  const error = validarMontoCheckout(cuenta.saldoCentimos);
  if (error) return { ok: false, mensaje: error };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const retorno = urlsRetornoCheckout(base, token, clave);
  const metadatos = metadatosCheckout(cuenta.cuenta, cuenta.restauranteId);

  try {
    const sesion = await crearClienteStripe().checkout.sessions.create({
      mode: "payment",
      locale: "es-419",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: MONEDA_STRIPE,
          unit_amount: cuenta.saldoCentimos,
          product_data: {
            name: nombreLineaCheckout(cuenta.cuenta, cuenta.mesaNumero),
            description: cuenta.restauranteNombre,
          },
        },
      }],
      metadata: metadatos,
      payment_intent_data: { metadata: metadatos },
      success_url: retorno.exito,
      cancel_url: retorno.cancelado,
      expires_at: Math.floor(Date.now() / 1000) + DURACION_SESION_SEGUNDOS,
      integration_identifier: IDENTIFICADOR_INTEGRACION,
    });
    if (!sesion.url) return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
    return { ok: true, url: sesion.url };
  } catch {
    return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
  }
}

export type EstadoPagoOnline = "CONFIRMADO" | "PENDIENTE" | "ERROR";

// «Procesando pago…»: el pago solo cuenta cuando el webhook de Stripe lo registró.
// Volver de Stripe no prueba nada (cualquiera puede abrir esa URL).
export async function consultarPagoOnlineAction(
  token: unknown,
  clave: unknown,
  sesionStripe: unknown,
): Promise<EstadoPagoOnline> {
  if (typeof token !== "string" || (clave !== null && typeof clave !== "string") || !esSesionStripe(sesionStripe)) {
    return "ERROR";
  }
  try {
    const cuenta = await resolverCuentaOnline(token, clave);
    if (!cuenta) return "ERROR";
    return (await pagoStripeRegistrado(cuenta.cuenta, sesionStripe)) ? "CONFIRMADO" : "PENDIENTE";
  } catch {
    return "ERROR";
  }
}
