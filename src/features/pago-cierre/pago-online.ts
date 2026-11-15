import "server-only";

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarSesionAbierta } from "@/features/mesero/sesiones";
import { vencerPedidosSinPago } from "@/features/pedidos/vencimiento-datos";
import type { CuentaACobrar } from "./pago-logica";

// US-076: capa de datos del pago online. El cliente no inicia sesión, así que
// la cuenta SIEMPRE se resuelve desde el token del QR (y la clave privada del
// pedido para llevar), nunca desde un ID que mande el navegador.

export type CuentaOnline = {
  cuenta: CuentaACobrar;
  restauranteId: string;
  restauranteNombre: string;
  mesaNumero: number | null;
  saldoCentimos: number;
};

export type CheckoutStripe = {
  id: string;
  sessionId: string;
  restaurantId: string;
  tableSessionId: string | null;
  orderId: string | null;
  orderIds: string[];
  amountCentimos: number;
  status: string;
  expiresAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolverCuentaOnline(token: string, clave: string | null): Promise<CuentaOnline | null> {
  const acceso = await resolverAccesoQr(token);
  if (acceso.estado !== "VALIDO") return null;

  let cuenta: CuentaACobrar;
  // US-085: desde el QR de una mesa también se puede pedir para llevar.
  // Una clave identifica ese pedido; nunca debe sustituirse por la cuenta de mesa.
  if (clave !== null) {
    if (!UUID.test(clave)) return null;
    const pedidoId = await buscarPedidoParaLlevar(acceso.restauranteId, acceso.qrId, clave);
    if (!pedidoId) return null;
    cuenta = { tipo: "PARA_LLEVAR", id: pedidoId };
  } else {
    if (acceso.modalidad !== "DINE_IN" || !acceso.mesa) return null;
    const sesion = await buscarSesionAbierta(acceso.mesa.id);
    if (!sesion) return null;
    cuenta = { tipo: "MESA", id: sesion.id };
  }

  await vencerPedidosSinPago(acceso.restauranteId);
  const saldo = await saldoCuentaOnline(cuenta);
  if (saldo === null) return null;

  return {
    cuenta,
    restauranteId: acceso.restauranteId,
    restauranteNombre: acceso.restauranteNombre,
    mesaNumero: cuenta.tipo === "MESA" ? acceso.mesa?.numero ?? null : null,
    saldoCentimos: saldo,
  };
}

export async function iniciarRegistroCheckoutStripe(cuenta: CuentaACobrar): Promise<{
  id: string; amountCentimos: number; expiresAt: string;
} | null> {
  const { data, error } = await crearClienteAdmin().rpc("iniciar_checkout_stripe", {
    p_sesion_id: cuenta.tipo === "MESA" ? cuenta.id : null,
    p_pedido_id: cuenta.tipo === "PARA_LLEVAR" ? cuenta.id : null,
  });
  if (error) throw new Error(error.message);
  const fila = (Array.isArray(data) ? data[0] : data) as {
    checkout_id: string; amount: number | string; expires_at: string;
  } | undefined;
  if (!fila) return null;
  const amountCentimos = Math.round(Number(fila.amount) * 100);
  if (!Number.isSafeInteger(amountCentimos) || amountCentimos <= 0) return null;
  return { id: fila.checkout_id, amountCentimos, expiresAt: fila.expires_at };
}

export async function vincularCheckoutStripe(checkoutId: string, sessionId: string): Promise<void> {
  const { data, error } = await crearClienteAdmin().rpc("vincular_checkout_stripe", {
    p_checkout_id: checkoutId, p_session_id: sessionId,
  });
  if (error || data !== true) throw new Error("No se pudo vincular el Checkout");
}

export async function cancelarCheckoutStripe(checkoutId: string): Promise<void> {
  const { error } = await crearClienteAdmin().rpc("cancelar_checkout_stripe", { p_checkout_id: checkoutId });
  if (error) throw new Error("No se pudo cerrar el Checkout pendiente");
}

export async function obtenerCheckoutStripe(sessionId: string): Promise<CheckoutStripe | null> {
  const { data, error } = await crearClienteAdmin().rpc("obtener_checkout_stripe", { p_session_id: sessionId });
  if (error) throw new Error("No se pudo validar el Checkout");
  const fila = (Array.isArray(data) ? data[0] : data) as {
    id: string; restaurant_id: string; table_session_id: string | null; order_id: string | null;
    order_ids: string[]; amount: number | string; status: string; expires_at: string;
  } | undefined;
  if (!fila) return null;
  return {
    id: fila.id, sessionId, restaurantId: fila.restaurant_id,
    tableSessionId: fila.table_session_id, orderId: fila.order_id,
    orderIds: fila.order_ids, amountCentimos: Math.round(Number(fila.amount) * 100),
    status: fila.status, expiresAt: fila.expires_at,
  };
}

export async function prepararReembolsoCheckout(sessionId: string): Promise<{
  id: string; attempt: number; alreadyRefunded: boolean;
}> {
  const { data, error } = await crearClienteAdmin().rpc("preparar_reembolso_checkout", { p_session_id: sessionId });
  if (error) throw new Error("No se pudo preparar el reembolso");
  const fila = (Array.isArray(data) ? data[0] : data) as {
    checkout_id: string; intento: number; ya_reembolsado: boolean;
  } | undefined;
  if (!fila) throw new Error("No se encontró el Checkout para reembolsar");
  return { id: fila.checkout_id, attempt: fila.intento, alreadyRefunded: fila.ya_reembolsado };
}

export async function finalizarReembolsoCheckout(sessionId: string, refundId: string | null, errorCode: string | null): Promise<void> {
  const { error } = await crearClienteAdmin().rpc("finalizar_reembolso_checkout", {
    p_session_id: sessionId, p_refund_id: refundId, p_error: errorCode,
  });
  if (error) throw new Error("No se pudo guardar el resultado del reembolso");
}

export async function actualizarEstadoReembolsoCheckout(
  checkoutId: string, attempt: number, refundId: string, status: string, errorCode: string | null,
): Promise<void> {
  const { error } = await crearClienteAdmin().rpc("actualizar_estado_reembolso_checkout", {
    p_checkout_id: checkoutId, p_intento: attempt, p_refund_id: refundId, p_status: status, p_error: errorCode,
  });
  if (error) throw new Error("No se pudo actualizar el estado del reembolso");
}

async function buscarPedidoParaLlevar(restauranteId: string, qrId: string, clave: string): Promise<string | null> {
  const { data, error } = await crearClienteAdmin()
    .from("orders")
    .select("id")
    .eq("restaurant_id", restauranteId)
    .eq("qr_code_id", qrId)
    .eq("idempotency_key", clave)
    .eq("modality", "TAKEAWAY")
    .maybeSingle();
  if (error) throw new Error("No se pudo buscar el pedido para llevar");
  return data?.id ?? null;
}

// El saldo lo calcula la base (consumo - pagos confirmados). null = cuenta no abierta.
async function saldoCuentaOnline(cuenta: CuentaACobrar): Promise<number | null> {
  const { data, error } = await crearClienteAdmin().rpc("saldo_cuenta_online", {
    p_sesion_id: cuenta.tipo === "MESA" ? cuenta.id : null,
    p_pedido_id: cuenta.tipo === "PARA_LLEVAR" ? cuenta.id : null,
  });
  if (error) throw new Error("No se pudo calcular el saldo");
  if (data === null) return null;
  const centimos = Math.round(Number(data) * 100);
  return Number.isFinite(centimos) ? Math.max(centimos, 0) : null;
}

// Para el webhook: lo que devuelve registrar_pago_stripe.
export type ResultadoRegistroStripe =
  | { ok: true; pagoId: string; duplicado: boolean }
  | { ok: false; codigo: string };

export async function registrarPagoStripe(datos: {
  sesionStripe: string;
  intentoPago: string;
  cuenta: CuentaACobrar;
  montoCentimos: number;
}): Promise<ResultadoRegistroStripe> {
  const { data, error } = await crearClienteAdmin().rpc("registrar_pago_stripe", {
    p_stripe_session_id: datos.sesionStripe,
    p_payment_intent: datos.intentoPago,
    p_sesion_id: datos.cuenta.tipo === "MESA" ? datos.cuenta.id : null,
    p_pedido_id: datos.cuenta.tipo === "PARA_LLEVAR" ? datos.cuenta.id : null,
    p_monto: (datos.montoCentimos / 100).toFixed(2),
  });
  if (error) {
    const codigo = /^[A-Z_]+$/.test(error.message) ? error.message : "ERROR";
    return { ok: false, codigo };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { pago_id: string; duplicado: boolean } | undefined;
  if (!fila) return { ok: false, codigo: "ERROR" };
  return { ok: true, pagoId: fila.pago_id, duplicado: fila.duplicado };
}

// Para «Procesando pago…»: ¿ya llegó el webhook de esta sesión de Stripe?
// Solo responde si el pago es de la cuenta que resuelve el QR.
export async function pagoStripeRegistrado(cuenta: CuentaACobrar, sesionStripe: string): Promise<boolean> {
  const consulta = crearClienteAdmin()
    .from("payments")
    .select("id")
    .eq("stripe_session_id", sesionStripe)
    .eq("status", "CONFIRMED");
  const { data, error } = await (cuenta.tipo === "MESA"
    ? consulta.eq("table_session_id", cuenta.id)
    : consulta.eq("order_id", cuenta.id)
  ).maybeSingle();
  if (error) throw new Error("No se pudo consultar el pago");
  return data !== null;
}
