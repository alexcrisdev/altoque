import "server-only";

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import {
  ETIQUETA_ESTADO,
  type EstadoPedido,
} from "./estados";
import { calcularLimitePago } from "./temporizador-pago";
import { vencerPedidosSinPago } from "./vencimiento-datos";
import {
  construirLineaTiempo,
  estimarTiempoRestante,
  inicioEnCocina,
  type PasoLineaTiempo,
  type TiempoEstimado,
} from "./linea-tiempo";
import { leerEventosPedido, leerPromedioCocinaMs } from "./linea-tiempo-datos";

export type PedidoCliente = {
  numero: number;
  estado: EstadoPedido;
  creadoEn: string;
  modalidad: "DINE_IN" | "TAKEAWAY";
  mesaNumero: number | null;
  items: {
    nombre: string;
    cantidad: number;
  }[];
  motivo: string | null;
  limitePago: string;
  pagoPendiente: boolean;
  /** US-092: pasos con su hora (HH:MM Lima). Sin personal ni motivos. */
  lineaTiempo: PasoLineaTiempo[];
  estimado: TiempoEstimado | null;
};

type FilaPedido = {
  id: string;
  order_number: number;
  status: string;
  created_at: string;
  table_session_id: string | null;
  modality: "DINE_IN" | "TAKEAWAY";
  dining_tables: { number: number } | null;
  order_items: {
    product_name: string;
    quantity: number;
  }[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esEstadoPedido(estado: string): estado is EstadoPedido {
  return Object.hasOwn(ETIQUETA_ESTADO, estado);
}

export async function consultarPedidoCliente(
  token: string,
  clave: string,
): Promise<PedidoCliente | null> {
  if (
    typeof token !== "string" ||
    typeof clave !== "string" ||
    !UUID.test(clave)
  ) {
    return null;
  }

  const acceso = await resolverAccesoQr(token);

  if (acceso.estado !== "VALIDO") return null;

  const supabase = crearClienteAdmin();
  await vencerPedidosSinPago(acceso.restauranteId);

  // La búsqueda exige el QR y la clave privada de este pedido.
  // El restaurante también se obtiene del QR validado en el servidor.
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      table_session_id,
      modality,
      dining_tables(number),
      order_items(product_name, quantity)
    `)
    .eq("restaurant_id", acceso.restauranteId)
    .eq("qr_code_id", acceso.qrId)
    .eq("idempotency_key", clave)
    .maybeSingle()
    .overrideTypes<FilaPedido | null, { merge: false }>();

  if (error) {
    console.error("consultarPedidoCliente", error.code);
    throw new Error("No se pudo consultar el pedido.");
  }

  // Un resultado vacío es distinto de una consulta fallida.
  if (!data) return null;

  let pagoPendiente = false;
  if (data.status === "PENDING") {
    const pagosPedido = await supabase.from("payments").select("id").eq("restaurant_id", acceso.restauranteId)
      .eq("order_id", data.id).eq("status", "PENDING").limit(1).maybeSingle()
      .overrideTypes<{ id: string } | null, { merge: false }>();
    if (pagosPedido.error) throw new Error("No se pudo consultar el pago del pedido.");
    pagoPendiente = pagosPedido.data !== null;
    if (!pagoPendiente && data.table_session_id) {
      const pagosSesion = await supabase.from("payments").select("id").eq("restaurant_id", acceso.restauranteId)
        .eq("table_session_id", data.table_session_id).eq("status", "PENDING").limit(1).maybeSingle()
        .overrideTypes<{ id: string } | null, { merge: false }>();
      if (pagosSesion.error) throw new Error("No se pudo consultar el pago de la sesión.");
      pagoPendiente = pagosSesion.data !== null;
    }
  }

  if (!esEstadoPedido(data.status)) {
    throw new Error("El estado del pedido no es válido.");
  }

  let motivo: string | null = null;

  if (data.status === "CANCELLED") {
    const historial = await supabase
      .from("order_status_history")
      .select("reason")
      .eq("restaurant_id", acceso.restauranteId)
      .eq("order_id", data.id)
      .eq("to_status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .overrideTypes<
        { reason: string | null } | null,
        { merge: false }
      >();

    if (historial.error) {
      console.error(
        "consultarPedidoCliente:motivo",
        historial.error.code,
      );
      throw new Error("No se pudo consultar el motivo de cancelación.");
    }

    motivo = historial.data?.reason?.trim() || null;
  }

  // US-092: historial de este pedido (ya validado por QR + clave).
  const eventos = await leerEventosPedido(supabase, acceso.restauranteId, data.id);
  const ahora = Date.now();
  const promedioMs =
    data.status === "PENDING" || data.status === "ACCEPTED" || data.status === "IN_PROGRESS"
      ? await leerPromedioCocinaMs(supabase, acceso.restauranteId, ahora)
      : null;

  // Construimos la respuesta explícitamente: sin claves, IDs,
  // datos del personal, datos de contacto ni información de pagos.
  return {
    numero: Number(data.order_number),
    estado: data.status,
    creadoEn: data.created_at,
    modalidad: data.modality,
    mesaNumero:
      data.modality === "DINE_IN"
        ? data.dining_tables?.number ?? null
        : null,
    items: data.order_items.map((item) => ({
      nombre: item.product_name,
      cantidad: item.quantity,
    })),
    motivo,
    limitePago: calcularLimitePago(data.created_at),
    pagoPendiente,
    lineaTiempo: construirLineaTiempo(eventos, data.status, data.created_at),
    estimado: estimarTiempoRestante(
      data.status,
      promedioMs,
      inicioEnCocina(eventos),
      ahora,
    ),
  };
}
