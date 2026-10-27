import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { LineaValidada } from "@/features/pedidos/validacion";
import { motivoDeError, type MotivoRechazo, type SolicitudAsistida } from "./solicitud-asistida";

// Capa de datos del pedido asistido. Usa la sesión del mesero (no la clave
// secreta): la base sabe quién registra el pedido y RLS sigue aplicando.

export type ResultadoGuardado =
  | { ok: true; numero: number; repetido: boolean }
  | { ok: false; motivo: MotivoRechazo };

type FilaRegistro = { pedido_id: string; numero_pedido: number; repetido: boolean };

// Si el mesero reintenta con la misma clave, devuelve el pedido que ya se creó.
export async function buscarPedidoAsistido(
  usuarioId: string,
  clave: string,
): Promise<number | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .eq("source", "WAITER")
    .eq("created_by", usuarioId)
    .eq("idempotency_key", clave)
    .maybeSingle();

  if (error) {
    console.error("buscarPedidoAsistido", error.code);
    throw new Error("No se pudo consultar el pedido.");
  }
  return data ? Number(data.order_number) : null;
}

export async function guardarPedidoAsistido(
  restauranteId: string,
  clave: string,
  solicitud: SolicitudAsistida,
  lineas: LineaValidada[],
): Promise<ResultadoGuardado> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("registrar_pedido_mesero", {
      p_restaurant_id: restauranteId,
      p_modality: solicitud.modalidad,
      p_dining_table_id: solicitud.mesaId,
      p_branch_id: solicitud.localId,
      p_idempotency_key: clave,
      p_items: lineas.map((linea) => ({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        observacion: linea.observacion,
      })),
    })
    .single<FilaRegistro>();

  if (error || !data) {
    if (error?.code) console.error("guardarPedidoAsistido", error.code);
    return { ok: false, motivo: motivoDeError(error?.message) };
  }
  return { ok: true, numero: Number(data.numero_pedido), repetido: data.repetido };
}
