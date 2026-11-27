"use server";

import { revalidatePath } from "next/cache";
import { guardarEdicionPedidoCliente } from "./edicion-cliente-datos";
import { mensajeErrorEdicionCliente } from "./edicion-cliente-logica";
import type { CambioPedido } from "./modificacion";

export async function modificarPedidoClienteAction(
  token: string, clave: string, revision: string, cambios: CambioPedido[], confirmarAnulacion: boolean,
) {
  try {
    const resultado = await guardarEdicionPedidoCliente(token, clave, revision, cambios, confirmarAnulacion);
    if (!resultado.ok) {
      return {
        ok: false as const,
        mensaje: mensajeErrorEdicionCliente(resultado.codigo),
        recargar: ["ORDER_CHANGED", "PAYMENT_PENDING", "CHECKOUT_OPEN", "PAYMENT_CONFIRMED",
          "INVALID_STATE", "ORDER_EXPIRED", "ACCOUNT_CLOSED", "ORDER_NOT_FOUND"].includes(resultado.codigo),
      };
    }
    revalidatePath("/mesero");
    revalidatePath("/mesero/pedidos/[id]", "page");
    revalidatePath("/caja");
    revalidatePath("/caja/mesa/[sesionId]", "page");
    revalidatePath("/caja/pedido/[pedidoId]", "page");
    revalidatePath("/cocina");
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/pedidos/[id]", "page");
    return { ok: true as const, ...resultado.cambio };
  } catch {
    return { ok: false as const, mensaje: mensajeErrorEdicionCliente(""), recargar: false };
  }
}
