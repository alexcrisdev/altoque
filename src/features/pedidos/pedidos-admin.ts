import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Modalidad } from "./modalidad";
import type { EstadoPedido } from "./estados";

export type PedidoAdmin = {
  id: string;
  numero: number;
  creadoEn: string;
  modalidad: Modalidad;
  estado: EstadoPedido;
  mesaNumero: number | null;
  nombre: string | null;
  telefono: string | null;
};

export async function listarPedidosAdmin(restauranteId: string): Promise<PedidoAdmin[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, modality, status, customer_name, customer_phone, dining_tables(number)")
    .eq("restaurant_id", restauranteId)
    .order("created_at", { ascending: false })
    .limit(30)
    .overrideTypes<Array<{
      id: string;
      order_number: number;
      created_at: string;
      modality: Modalidad;
      status: EstadoPedido;
      customer_name: string | null;
      customer_phone: string | null;
      dining_tables: { number: number } | null;
    }>, { merge: false }>();
  if (error) {
    console.error("listarPedidosAdmin", error.code);
    throw new Error("No se pudieron cargar los pedidos.");
  }
  return data.map((fila) => ({
    id: fila.id,
    numero: Number(fila.order_number),
    creadoEn: fila.created_at,
    modalidad: fila.modality,
    estado: fila.status,
    mesaNumero: fila.dining_tables?.number ?? null,
    nombre: fila.customer_name,
    telefono: fila.customer_phone,
  }));
}

export async function obtenerPedidoAdmin(restauranteId: string, pedidoId: string): Promise<PedidoAdmin | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, modality, status, customer_name, customer_phone, dining_tables(number)")
    .eq("restaurant_id", restauranteId)
    .eq("id", pedidoId)
    .maybeSingle()
    .overrideTypes<{
      id: string;
      order_number: number;
      created_at: string;
      modality: Modalidad;
      status: EstadoPedido;
      customer_name: string | null;
      customer_phone: string | null;
      dining_tables: { number: number } | null;
    } | null, { merge: false }>();
  if (error) {
    console.error("obtenerPedidoAdmin", error.code);
    throw new Error("No se pudo cargar el pedido.");
  }
  if (!data) return null;
  return {
    id: data.id,
    numero: Number(data.order_number),
    creadoEn: data.created_at,
    modalidad: data.modality,
    estado: data.status,
    mesaNumero: data.dining_tables?.number ?? null,
    nombre: data.customer_name,
    telefono: data.customer_phone,
  };
}
