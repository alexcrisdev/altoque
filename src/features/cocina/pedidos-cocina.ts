import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { ESTADOS_ACTIVOS, type EstadoPedido } from "../pedidos/estados";
import type { Modalidad } from "@/features/pedidos/modalidad";
import type { PedidoCocina } from "./tipos";
import type { TipoIncidencia } from "../pedidos/incidencias";

type FilaPedido = {
  id: string;
  order_number: number;
  created_at: string;
  status: EstadoPedido;
  ready_at?: string | null;
  modality: Modalidad;
  source: "QR" | "WAITER";
  customer_name: string | null;
  dining_tables: { number: number } | null;
  order_items: { product_name: string; quantity: number; observation: string | null }[];
  order_incidents: { id: string; type: TipoIncidencia; description: string; status: "OPEN" | "RESOLVED"; created_at: string }[];
};

export async function listarPedidosCocina(restauranteId: string): Promise<PedidoCocina[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, status, ready_at, modality, source, customer_name, dining_tables(number), order_items(product_name, quantity, observation), order_incidents(id, type, description, status, created_at)")
    .eq("restaurant_id", restauranteId)
    .in("status", ESTADOS_ACTIVOS)
    .order("created_at", { ascending: true })
    .order("order_number", { ascending: true })
    .overrideTypes<FilaPedido[], { merge: false }>();

  if (error) {
    console.error(error.code);
    throw new Error("No se pudieron cargar los pedidos de cocina.");
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    numero: Number(fila.order_number),
    creadoEn: fila.created_at,
    estado: fila.status,
    ...(fila.status === "READY" ? { listoEn: fila.ready_at ?? null } : {}),
    modalidad: fila.modality,
    asistido: fila.source === "WAITER",
    mesaNumero: fila.dining_tables?.number ?? null,
    nombreCliente: fila.customer_name,
    items: fila.order_items.map((item) => ({
      nombre: item.product_name,
      cantidad: item.quantity,
      observacion: item.observation,
    })),
    incidenciasAbiertas: fila.order_incidents.filter((incidencia) => incidencia.status === "OPEN").map((incidencia) => ({
      id: incidencia.id,
      tipo: incidencia.type,
      descripcion: incidencia.description,
      creadaEn: incidencia.created_at,
    })),
  }));
}

// Solo se consulta tras un rechazo para distinguir una cancelación de otro cambio.
export async function obtenerEstadoActualCocina(restauranteId: string, pedidoId: string): Promise<EstadoPedido | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("orders")
    .select("status")
    .eq("restaurant_id", restauranteId)
    .eq("id", pedidoId)
    .maybeSingle()
    .overrideTypes<{ status: EstadoPedido } | null, { merge: false }>();
  if (error) {
    console.error(error.code);
    throw new Error("No se pudo consultar el estado actual del pedido.");
  }
  return data?.status ?? null;
}
