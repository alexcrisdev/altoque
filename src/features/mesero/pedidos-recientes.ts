import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Modalidad } from "@/features/pedidos/modalidad";

// Capa de datos: últimos pedidos del restaurante para el personal.
// Usa la sesión del usuario: RLS solo deja ver pedidos de su restaurante.

export type PedidoReciente = {
  numero: number;
  creadoEn: string;
  modalidad: Modalidad;
  asistido: boolean;
  mesaNumero: number | null;
  nombre: string | null;
  telefono: string | null;
  totalCentimos: number;
};

type FilaPedido = {
  order_number: number;
  created_at: string;
  modality: Modalidad;
  source: "QR" | "WAITER";
  customer_name: string | null;
  customer_phone: string | null;
  total: number | string;
  dining_tables: { number: number } | null;
};

export async function listarPedidosRecientes(
  restauranteId: string,
  limite = 15,
): Promise<PedidoReciente[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("order_number, created_at, modality, source, customer_name, customer_phone, total, dining_tables(number)")
    .eq("restaurant_id", restauranteId)
    .order("created_at", { ascending: false })
    .limit(limite)
    .overrideTypes<FilaPedido[], { merge: false }>();

  if (error) {
    console.error("listarPedidosRecientes", error.code);
    throw new Error("No se pudieron cargar los pedidos");
  }

  return data.map((fila) => ({
    numero: Number(fila.order_number),
    creadoEn: fila.created_at,
    modalidad: fila.modality,
    asistido: fila.source === "WAITER",
    mesaNumero: fila.dining_tables?.number ?? null,
    nombre: fila.customer_name,
    telefono: fila.customer_phone,
    totalCentimos: Math.round(Number(fila.total) * 100),
  }));
}
