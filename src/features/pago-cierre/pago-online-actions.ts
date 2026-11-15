"use server";

// US-076: acciones del pago con tarjeta online. Las usa el cliente desde su
// celular, sin iniciar sesión: todo se valida con el token del QR.

import { leerCorreoBoleta } from "./comprobante-logica";
import {
  cancelarCheckoutStripe, iniciarRegistroCheckoutStripe, pagoStripeRegistrado,
  resolverCuentaOnline, vincularCheckoutStripe,
} from "./pago-online";
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

export async function iniciarPagoTarjetaAction(token: unknown, clave: unknown, correo: unknown = null): Promise<ResultadoInicioPago> {
  if (typeof token !== "string" || (clave !== null && typeof clave !== "string")) {
    return { ok: false, mensaje: mensajeErrorStripe("ACCOUNT_NOT_FOUND") };
  }
  const email = leerCorreoBoleta(correo);
  if (!email.ok) return email;
  if (!stripeConfigurado()) return { ok: false, mensaje: mensajeErrorStripe("STRIPE_NOT_CONFIGURED") };

  let cuenta;
  try {
    cuenta = await resolverCuentaOnline(token, clave);
  } catch {
    return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
  }
  if (!cuenta) return { ok: false, mensaje: mensajeErrorStripe("ACCOUNT_NOT_FOUND") };
  const saldoInicialError = validarMontoCheckout(cuenta.saldoCentimos);
  if (saldoInicialError) return { ok: false, mensaje: saldoInicialError };

  // El monto es el saldo que calculó la base; el navegador no manda ningún monto.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const retorno = urlsRetornoCheckout(base, token, clave);
  let checkout: Awaited<ReturnType<typeof iniciarRegistroCheckoutStripe>>;
  try {
    checkout = await iniciarRegistroCheckoutStripe(cuenta.cuenta);
  } catch {
    return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
  }
  if (!checkout) return { ok: false, mensaje: mensajeErrorStripe("ACCOUNT_NOT_FOUND") };
  const error = validarMontoCheckout(checkout.amountCentimos);
  if (error) {
    await cancelarCheckoutStripe(checkout.id).catch(() => {});
    return { ok: false, mensaje: error };
  }
  const metadatos = metadatosCheckout(cuenta.cuenta, cuenta.restauranteId, checkout.id);
  const metadatosSesion = { ...metadatos, ...(email.correo ? { receipt_email: email.correo } : {}) };
  let sesionCreada: string | null = null;

  try {
    const sesion = await crearClienteStripe().checkout.sessions.create({
      mode: "payment",
      locale: "es-419",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: MONEDA_STRIPE,
          unit_amount: checkout.amountCentimos,
          product_data: {
            name: nombreLineaCheckout(cuenta.cuenta, cuenta.mesaNumero),
            description: cuenta.restauranteNombre,
          },
        },
      }],
      metadata: metadatosSesion,
      payment_intent_data: { metadata: metadatos },
      success_url: retorno.exito,
      cancel_url: retorno.cancelado,
      expires_at: Math.floor(new Date(checkout.expiresAt).getTime() / 1000),
      integration_identifier: IDENTIFICADOR_INTEGRACION,
    }, { idempotencyKey: `altoque-checkout-${checkout.id}` });
    sesionCreada = sesion.id;
    if (!sesion.url) {
      try {
        await crearClienteStripe().checkout.sessions.expire(sesion.id);
        await cancelarCheckoutStripe(checkout.id);
      } catch {
        await vincularCheckoutStripe(checkout.id, sesion.id).catch(() => {});
      }
      return { ok: false, mensaje: mensajeErrorStripe("STRIPE_ERROR") };
    }
    await vincularCheckoutStripe(checkout.id, sesion.id);
    return { ok: true, url: sesion.url };
  } catch {
    if (sesionCreada) {
      // Si la creación remota terminó pero falló el enlace local, conservar el
      // registro y reintentar el enlace. No desproteger pedidos de un Checkout vivo.
      await vincularCheckoutStripe(checkout.id, sesionCreada).catch(() => {});
    } else {
      await cancelarCheckoutStripe(checkout.id).catch(() => {});
    }
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
