import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoPedido } from "./estados";

export async function guardarEstadoPedido(pedidoId: string, estado: EstadoPedido, motivo?: string) {
  const supabase = await crearClienteServidor();
  // La RPC verifica la membresía en el restaurante del pedido y bloquea la fila.
  return supabase.rpc("cambiar_estado_pedido", {
    p_pedido_id: pedidoId,
    p_estado: estado,
    p_motivo: motivo?.trim() || null,
  });
}
