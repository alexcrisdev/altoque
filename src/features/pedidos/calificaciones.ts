import "server-only";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import type { Calificacion } from "./calificacion-logica";

export type EstadoCalificacion = { disponible: boolean; calificada: boolean };

export async function leerEstadoCalificacion(qrId: string, clave: string): Promise<EstadoCalificacion | null> {
  const { data, error } = await crearClienteAdmin().rpc("estado_calificacion_cliente", { p_qr_id: qrId, p_clave: clave })
    .maybeSingle<EstadoCalificacion>();
  if (error) throw new Error("No se pudo consultar la calificación.");
  return data;
}

export async function guardarCalificacion(qrId: string, clave: string, entrada: Calificacion): Promise<"OK" | "REPETIDA"> {
  const { error } = await crearClienteAdmin().rpc("calificar_pedido_cliente", {
    p_qr_id: qrId, p_clave: clave, p_servicio: entrada.servicio,
    p_mesero: entrada.mesero, p_comentario: entrada.comentario,
  });
  if (error?.code === "23505") return "REPETIDA";
  if (error) throw new Error("No se pudo guardar la calificación. Comprueba que el pedido esté pagado o entregado.");
  return "OK";
}
