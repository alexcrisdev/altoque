"use server";

import { resolverAccesoQr } from "../acceso-qr/acceso";
import { esClavePedido, validarCalificacion } from "./calificacion-logica";
import { guardarCalificacion, leerEstadoCalificacion, type EstadoCalificacion } from "./calificaciones";

export async function consultarCalificacionAction(token: unknown, clave: unknown): Promise<EstadoCalificacion | null> {
  if (typeof token !== "string" || !esClavePedido(clave)) return null;
  const acceso = await resolverAccesoQr(token);
  if (acceso.estado !== "VALIDO") return null;
  return leerEstadoCalificacion(acceso.qrId, clave);
}

export async function calificarPedidoAction(token: unknown, clave: unknown, entrada: unknown): Promise<
  { ok: true } | { ok: false; repetida?: boolean; mensaje: string }
> {
  const calificacion = validarCalificacion(entrada);
  if (typeof token !== "string" || !esClavePedido(clave) || !calificacion) {
    return { ok: false, mensaje: "Elige de 1 a 5 estrellas en ambos campos y un comentario de hasta 200 caracteres, sin saltos de línea ni caracteres de control." };
  }
  try {
    const acceso = await resolverAccesoQr(token);
    if (acceso.estado !== "VALIDO") return { ok: false, mensaje: "Este QR ya no está disponible." };
    const resultado = await guardarCalificacion(acceso.qrId, clave, calificacion);
    return resultado === "REPETIDA"
      ? { ok: false, repetida: true, mensaje: "Este pedido ya tiene una calificación." }
      : { ok: true };
  } catch {
    return { ok: false, mensaje: "No pudimos guardar tu opinión. Comprueba que el pedido esté pagado o entregado e inténtalo nuevamente." };
  }
}
