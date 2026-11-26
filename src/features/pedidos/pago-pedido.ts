import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

// US-105: ¿el pedido está cubierto por un pago confirmado? Lo decide la base
// (pedido_pagado), con la misma regla que impide cancelarlo o dejarlo vencer.
export async function consultarPedidoPagado(pedidoId: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("pedido_pagado", { p_pedido_id: pedidoId });
  if (error) {
    console.error("consultarPedidoPagado", error.code);
    throw new Error("No se pudo consultar el pago del pedido.");
  }
  return data === true;
}
