import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { OpcionesPedido } from "./modalidad";
import type { LineaValidada } from "./validacion";
import { mensajeStockInsuficiente } from "./stock-mensaje";
import type { AlergiaPedido } from "./alergias";

export const MENSAJE_LIMITE_PEDIDOS_QR = "Tienes 2 pedidos sin pagar. Págalos o espera a que venzan para pedir otro.";

export type PedidoRegistrado = { id: string; numero: number; repetido: boolean };

export async function buscarPedidoIdempotente(qrId: string, clave: string): Promise<PedidoRegistrado | null> {
  const supabase = crearClienteAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, daily_number")
    .eq("qr_code_id", qrId)
    .eq("idempotency_key", clave)
    .maybeSingle();
  if (error) {
    if (error.code) console.error("buscarPedidoIdempotente", error.code);
    throw new Error("No se pudo consultar el pedido.");
  }
  return data ? { id: data.id, numero: Number(data.daily_number ?? data.order_number), repetido: true } : null;
}

// US-105: las funciones que crean pedidos devuelven order_number (interno). El número que
// ve la gente es el del día, que asigna un trigger al crear el pedido. Si la consulta
// falla, se muestra el interno antes que dejar el pedido sin número.
export async function numeroDelDia(
  supabase: SupabaseClient,
  pedidoId: string,
  respaldo: number,
): Promise<number> {
  try {
    const { data, error } = await supabase.from("orders").select("daily_number").eq("id", pedidoId).maybeSingle();
    if (!error && data?.daily_number) return Number(data.daily_number);
  } catch {
    // Sigue con el respaldo.
  }
  console.error("US-105: número del día no disponible");
  return respaldo;
}


export async function guardarPedidoQr(
  qrId: string,
  restauranteId: string,
  clave: string,
  lineas: LineaValidada[],
  opciones: OpcionesPedido,
  alergia: AlergiaPedido,
): Promise<PedidoRegistrado> {
  try {
    const supabase = crearClienteAdmin();
    // US-002: la modalidad la elige el cliente; la base la vuelve a validar.
    const { data, error } = await supabase.rpc("registrar_pedido_cliente", {
      p_qr_code_id: qrId,
      p_idempotency_key: clave,
      p_items: lineas.map((linea) => ({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        observacion: linea.observacion,
      })),
      p_modality: opciones.modalidad,
      p_customer_name: opciones.nombre,
      p_customer_phone: opciones.telefono,
      p_alergia_respuesta: alergia.respuesta,
      p_alergenos: alergia.alergenos,
      p_alergia_detalle: alergia.detalle,
    }).single();

    if (error || !data) {
      if (error?.code) console.error("guardarPedidoQr", error.code);
      if (error?.message.includes("QR_PENDING_LIMIT")) throw new Error(MENSAJE_LIMITE_PEDIDOS_QR);
      const mensajeStock = mensajeStockInsuficiente(
        error?.message,
        lineas.map((linea) => ({ productoId: linea.productoId, nombre: linea.nombre })),
      );
      if (mensajeStock) throw new Error(mensajeStock);
      throw new Error("No se pudo registrar el pedido. Verifica la carta y vuelve a intentar.");
    }
    const resultado = data as { pedido_id: string; numero_pedido: number; repetido: boolean };
    // El trigger omite la fila si se alcanzó el límite. Al devolver un resultado
    // normal, PostgreSQL confirma los vencimientos ejecutados antes del intento.
    if (!resultado.pedido_id) throw new Error(MENSAJE_LIMITE_PEDIDOS_QR);
    return {
      id: resultado.pedido_id,
      numero: await numeroDelDia(supabase, resultado.pedido_id, resultado.numero_pedido),
      repetido: resultado.repetido,
    };
  } catch (error) {
    if (error instanceof Error && (error.message === MENSAJE_LIMITE_PEDIDOS_QR || error.message.startsWith("No se pudo registrar") || error.message.startsWith("Ya no hay"))) throw error;
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
      console.error("guardarPedidoQr", error.code);
    }
    throw new Error("No se pudo registrar el pedido. Intenta de nuevo.");
  }
}
