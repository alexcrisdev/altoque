import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export async function vencerPedidosSinPago(restauranteId: string): Promise<void> {
  const { error } = await crearClienteAdmin().rpc("vencer_pedidos_sin_pago", {
    p_restaurante: restauranteId,
  });
  if (error) {
    console.error("vencerPedidosSinPago", error.code);
    throw new Error("No se pudieron actualizar los pedidos vencidos.");
  }
}
