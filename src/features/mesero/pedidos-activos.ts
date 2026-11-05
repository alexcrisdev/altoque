import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { ESTADOS_ACTIVOS, type EstadoPedido } from "../pedidos/estados";
import type { Modalidad } from "../pedidos/modalidad";

export type PedidoActivo = {
  id: string;
  numero: number;
  creadoEn: string;
  estado: EstadoPedido;
  modalidad: Modalidad;
  mesaId: string | null;
  mesaNumero: number | null;
  nombreCliente: string | null;
  asistido: boolean;
};

type FilaPedido = {
  id: string;
  order_number: number;
  created_at: string;
  status: EstadoPedido;
  modality: Modalidad;
  dining_table_id: string | null;
  dining_tables: { number: number } | null;
  customer_name: string | null;
  source: "QR" | "WAITER";
};

export async function listarPedidosActivos(restauranteId: string): Promise<PedidoActivo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("orders")
    .select("id, order_number, created_at, status, modality, dining_table_id, dining_tables(number), customer_name, source")
    .eq("restaurant_id", restauranteId)
    .in("status", ESTADOS_ACTIVOS)
    .order("created_at", { ascending: true })
    .overrideTypes<FilaPedido[], { merge: false }>();

  if (error) {
    console.error("listarPedidosActivos", error.code);
    throw new Error("No se pudieron cargar los pedidos activos.");
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    numero: Number(fila.order_number),
    creadoEn: fila.created_at,
    estado: fila.status,
    modalidad: fila.modality,
    mesaId: fila.dining_table_id,
    mesaNumero: fila.dining_tables?.number ?? null,
    nombreCliente: fila.customer_name,
    asistido: fila.source === "WAITER",
  }));
}
