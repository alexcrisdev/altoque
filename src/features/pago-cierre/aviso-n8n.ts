import "server-only";

import { after } from "next/server";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { registrarError } from "../../lib/registro";
import {
  agruparPlatos,
  cabecerasAviso,
  configuracionN8n,
  construirAvisoPago,
  type ConfigN8n,
  type DatosPagoConfirmado,
} from "./aviso-n8n-logica";

// US-086: capa que lee el pago confirmado y avisa a n8n. Usa el cliente admin
// porque el aviso también sale del webhook de Stripe, donde no hay usuario.
// Solo lee: nunca modifica pagos ni pedidos.

const ESPERA_MAXIMA_MS = 5000;

type FilaPago = {
  id: string;
  restaurant_id: string;
  table_session_id: string | null;
  order_id: string | null;
  method: "CASH" | "YAPE" | "CARD";
  status: string;
  amount: number | string;
  confirmed_at: string | null;
  stripe_session_id: string | null;
  receipt_email: string | null;
  restaurants: { name: string } | null;
};

type FilaPedido = {
  order_number: number;
  order_items: { product_name: string; quantity: number; unit_price: number | string; subtotal: number | string }[];
};

export async function leerPagoConfirmado(pagoId: string): Promise<DatosPagoConfirmado | null> {
  const supabase = crearClienteAdmin();
  const { data: pago, error } = await supabase
    .from("payments")
    .select("id, restaurant_id, table_session_id, order_id, method, status, amount, confirmed_at, stripe_session_id, receipt_email, restaurants(name)")
    .eq("id", pagoId)
    .maybeSingle<FilaPago>();
  if (error) throw new Error("No se pudo leer el pago");
  if (!pago || pago.status !== "CONFIRMED" || !pago.confirmed_at) return null;

  const columnasPedido = "order_number, order_items(product_name, quantity, unit_price, subtotal)";
  let cuenta: DatosPagoConfirmado["cuenta"];
  let pedidos: FilaPedido[];

  if (pago.table_session_id) {
    const { data: sesion, error: errorSesion } = await supabase
      .from("table_sessions")
      .select("dining_table_id")
      .eq("id", pago.table_session_id)
      .eq("restaurant_id", pago.restaurant_id)
      .maybeSingle<{ dining_table_id: string }>();
    if (errorSesion || !sesion) throw new Error("No se pudo leer la mesa");
    const { data: mesa } = await supabase
      .from("dining_tables")
      .select("number")
      .eq("id", sesion.dining_table_id)
      .eq("restaurant_id", pago.restaurant_id)
      .maybeSingle<{ number: number }>();
    cuenta = { tipo: "MESA", id: pago.table_session_id, mesa: mesa?.number ?? null };

    const { data, error: errorPedidos } = await supabase
      .from("orders")
      .select(columnasPedido)
      .eq("table_session_id", pago.table_session_id)
      .eq("restaurant_id", pago.restaurant_id)
      .neq("status", "CANCELLED")
      .returns<FilaPedido[]>();
    if (errorPedidos) throw new Error("No se pudieron leer los pedidos");
    pedidos = data ?? [];
  } else if (pago.order_id) {
    const { data, error: errorPedido } = await supabase
      .from("orders")
      .select(columnasPedido)
      .eq("id", pago.order_id)
      .eq("restaurant_id", pago.restaurant_id)
      .returns<FilaPedido[]>();
    if (errorPedido) throw new Error("No se pudo leer el pedido");
    pedidos = data ?? [];
    cuenta = { tipo: "PARA_LLEVAR", id: pago.order_id, pedido: pedidos[0]?.order_number ?? null };
  } else {
    return null;
  }

  const columnaCuenta = pago.table_session_id ? "table_session_id" : "order_id";
  const idCuenta = pago.table_session_id ?? pago.order_id!;
  const [pagos, reserva] = await Promise.all([
    supabase.from("payments").select("amount").eq("restaurant_id", pago.restaurant_id)
      .eq(columnaCuenta, idCuenta).eq("status", "CONFIRMED"),
    supabase.from("receipts").select("id, series, number, status, is_test").eq("restaurant_id", pago.restaurant_id)
      .eq("payment_id", pago.id).maybeSingle(),
  ]);
  if (pagos.error || reserva.error) throw new Error("No se pudo leer el saldo o la reserva de boleta");
  const platos = agruparPlatos(pedidos.flatMap((p) => p.order_items));
  const consumo = platos.reduce((total, p) => total + p.subtotalCentimos, 0);
  const pagado = (pagos.data ?? []).reduce((total, p) => total + Math.round(Number(p.amount) * 100), 0);
  return {
    pagoId: pago.id,
    restauranteId: pago.restaurant_id,
    restauranteNombre: pago.restaurants?.name ?? "",
    cuenta,
    metodo: pago.method,
    enLinea: pago.stripe_session_id !== null,
    montoCentimos: Math.round(Number(pago.amount) * 100),
    confirmadoEn: new Date(pago.confirmed_at).toISOString(),
    saldoRestanteCentimos: consumo - pagado,
    correoBoleta: pago.receipt_email,
    comprobante: reserva.data?.is_test ? {
      id: reserva.data.id, serie: reserva.data.series, numero: reserva.data.number,
      estado: reserva.data.status, is_test: true,
    } : null,
    platos,
  };
}

type Dependencias = {
  leer?: typeof leerPagoConfirmado;
  enviar?: typeof fetch;
  ahora?: () => number;
};

// Nunca lanza: si n8n no responde o rechaza, el pago ya quedó guardado y solo se
// deja el error en el log del servidor (sin secretos ni datos del cliente).
export async function enviarAvisoPago(
  pagoId: string,
  config: ConfigN8n,
  { leer = leerPagoConfirmado, enviar = fetch, ahora = Date.now }: Dependencias = {},
): Promise<boolean> {
  try {
    const datos = await leer(pagoId);
    if (!datos) {
      console.error(`[n8n] aviso omitido: el pago ${pagoId} no está confirmado`);
      return false;
    }
    const cuerpo = JSON.stringify(construirAvisoPago(datos));
    const timestamp = Math.floor(ahora() / 1000);
    const respuesta = await enviar(config.url, {
      method: "POST",
      headers: cabecerasAviso(cuerpo, config.secreto, timestamp),
      body: cuerpo,
      redirect: "error",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    });
    if (!respuesta.ok) {
      console.error(`[n8n] aviso del pago ${pagoId} rechazado: HTTP ${respuesta.status}`);
      return false;
    }
    return true;
  } catch (error) {
    const motivo = error instanceof Error && error.name === "TimeoutError" ? "sin respuesta en 5 s" : "error de red o de lectura";
    console.error(`[n8n] aviso del pago ${pagoId} no enviado: ${motivo}`);
    return false;
  }
}

// Programa el aviso para DESPUÉS de responder al usuario (o a Stripe): el cobro no
// espera a n8n. Si el aviso no está configurado, no hace nada.
export function programarAvisoPago(pagoId: string): void {
  let config: ConfigN8n | null;
  try {
    config = configuracionN8n(process.env);
  } catch (error) {
    // US-106 (Fase C): sin el mensaje del error, solo su tipo.
    registrarError("[n8n] configuración inválida: revisar N8N_WEBHOOK_URL y N8N_WEBHOOK_SECRET", error);
    return;
  }
  if (!config) return;
  const destino = config;
  after(() => enviarAvisoPago(pagoId, destino));
}
