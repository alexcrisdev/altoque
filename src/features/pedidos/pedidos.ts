import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

export type PedidoListado = {
  id: string;
  numero: number;
  modalidad: "DINE_IN" | "TAKEAWAY";
  estado: "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";
  total: number;
  creadoEn: string;
  mesa: number | null;
  lineas: {
    id: string;
    producto: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    observacion: string | null;
  }[];
};

type FilaPedido = {
  id: string;
  order_number: number;
  modality: PedidoListado["modalidad"];
  status: PedidoListado["estado"];
  total: number | string;
  created_at: string;
  dining_tables: { number: number } | null;
  order_items: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number | string;
    subtotal: number | string;
    observation: string | null;
  }[];
};

// Usa la sesión autenticada: RLS verifica pertenencia al restaurante y el filtro
// explícito evita pedir filas de restaurantes ajenos.
export async function listarPedidos(restauranteId: string): Promise<PedidoListado[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, modality, status, total, created_at, dining_tables(number), order_items(id, product_name, quantity, unit_price, subtotal, observation)")
    .eq("restaurant_id", restauranteId)
    .order("created_at", { ascending: false })
    .order("order_number", { ascending: false })
    .overrideTypes<FilaPedido[], { merge: false }>();

  if (error) {
    console.error("listarPedidos", error.code);
    throw new Error("No se pudieron cargar los pedidos.");
  }

  return data.map((pedido) => ({
    id: pedido.id,
    numero: Number(pedido.order_number),
    modalidad: pedido.modality,
    estado: pedido.status,
    total: Number(pedido.total),
    creadoEn: pedido.created_at,
    mesa: pedido.dining_tables?.number ?? null,
    lineas: pedido.order_items.map((linea) => ({
      id: linea.id,
      producto: linea.product_name,
      cantidad: linea.quantity,
      precioUnitario: Number(linea.unit_price),
      subtotal: Number(linea.subtotal),
      observacion: linea.observation,
    })),
  }));
}
