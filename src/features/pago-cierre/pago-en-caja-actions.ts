"use server";

import { revalidatePath } from "next/cache";
import { guardarEleccionCaja, listarPedidosPagoCaja } from "./pago-en-caja-datos";
import { contextoCaja } from "./acceso-caja";
import { esUuid } from "../mesero/solicitud-asistida";

export async function obtenerPedidosPagoCajaAction(pedidoId?: string) {
  const { restauranteId } = await contextoCaja();
  if (pedidoId !== undefined && !esUuid(pedidoId)) return [];
  return listarPedidosPagoCaja(restauranteId, pedidoId);
}

export async function elegirPagoEnCajaAction(token: string, clave: string, elegir: boolean) {
  try {
    const { estado, codigo } = await guardarEleccionCaja(token, clave, elegir);
    if (estado && !codigo) {
      revalidatePath("/caja");
      return { ok: true as const, estado };
    }
    if (codigo === "PAYMENT_IN_PROGRESS") {
      return { ok: false as const, mensaje: "Ya tienes un pago en curso. Espera a que termine antes de elegir caja." };
    }
    if (["ORDER_NOT_FOUND", "INVALID_STATE", "NOTHING_TO_PAY"].includes(codigo)) {
      return { ok: false as const, mensaje: "Este pedido ya no está disponible para pagar en caja." };
    }
  } catch {
    // No expone datos internos de la cuenta ni del QR.
  }
  return { ok: false as const, mensaje: "No pudimos actualizar la forma de pago. Vuelve a intentarlo." };
}
