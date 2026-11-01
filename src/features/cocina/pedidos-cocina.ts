import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { ESTADOS_ACTIVOS, type EstadoPedido } from "../pedidos/estados";
import type { Modalidad } from "@/features/pedidos/modalidad";
import type { PedidoCocina } from "./tipos";

type FilaPedido = {
  id: string;
  order_number: number;
  created_at: string;
  status: EstadoPedido;
  modality: Modalidad;
  source: "QR" | "WAITER";
  customer_name: string | null;
  dining_tables: { number: number } | null;
  order_items: { product_name: string; quantity: number; observation: string | null }[];
};

export async function listarPedidosCocina(restauranteId: string): Promise<PedidoCocina[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, status, modality, source, customer_name, dining_tables(number), order_items(product_name, quantity, observation)")
    .eq("restaurant_id", restauranteId)
    .in("status", ESTADOS_ACTIVOS)
    .order("created_at", { ascending: true })
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
    modalidad: fila.modality,
    asistido: fila.source === "WAITER",
    mesaNumero: fila.dining_tables?.number ?? null,
    nombreCliente: fila.customer_name,
    items: fila.order_items.map((item) => ({
      nombre: item.product_name,
      cantidad: item.quantity,
      observacion: item.observation,
    })),
  }));
}
