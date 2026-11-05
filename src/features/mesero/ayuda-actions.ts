"use server";

import { revalidatePath } from "next/cache";
import { resolverAccesoQr } from "../acceso-qr/acceso";
import { requerirRol } from "../auth/sesion";
import { atenderSolicitud, solicitarAyuda } from "./ayuda";

export type ResultadoAccionAyuda =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string; codigo?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function solicitarAyudaAction(token: string): Promise<ResultadoAccionAyuda> {
  if (typeof token !== "string" || token.length < 8 || token.length > 128) {
    return { ok: false, mensaje: "Este código QR no está disponible. Pide ayuda al personal." };
  }
  try {
    const acceso = await resolverAccesoQr(token);
    if (acceso.estado !== "VALIDO") {
      return { ok: false, mensaje: "Este código QR no está disponible. Pide ayuda al personal." };
    }
    // Solo se usa el QR resuelto en el servidor; no se aceptan IDs de mesa/restaurante.
    const resultado = await solicitarAyuda(acceso.qrId);
    if (resultado.ok) return { ok: true, mensaje: "Listo, avisamos al mesero" };
    if (resultado.codigo === "TABLE_NOT_OPEN") {
      return { ok: false, mensaje: "Pide al mesero que habilite la mesa antes de solicitar ayuda.", codigo: resultado.codigo };
    }
    if (resultado.codigo === "QR_UNAVAILABLE") {
      return { ok: false, mensaje: "Este código QR ya no está disponible. Pide ayuda al personal." };
    }
  } catch {
    // Nunca devolver al cliente detalles de conexión o credenciales del servidor.
  }
  return { ok: false, mensaje: "No pudimos avisar al mesero. Revisa tu conexión e inténtalo otra vez." };
}

export async function atenderSolicitudAction(id: string): Promise<ResultadoAccionAyuda> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, mensaje: "No se pudo identificar la solicitud." };
  }
  await requerirRol(["WAITER", "OWNER", "ADMIN"]);
  try {
    // La RPC usa auth.uid() y vuelve a comprobar el restaurante de la solicitud.
    const resultado = await atenderSolicitud(id);
    if (resultado.ok) {
      revalidatePath("/mesero");
      return { ok: true, mensaje: "Solicitud atendida." };
    }
    if (resultado.codigo === "ALREADY_ATTENDED") {
      revalidatePath("/mesero");
      return { ok: false, codigo: resultado.codigo, mensaje: "La solicitud ya fue atendida por otro integrante." };
    }
    if (resultado.codigo === "FORBIDDEN") return { ok: false, mensaje: "No tienes permiso para atender esta solicitud." };
    if (resultado.codigo === "REQUEST_NOT_FOUND") return { ok: false, mensaje: "La solicitud ya no está disponible." };
  } catch {
    // Un fallo conserva la solicitud visible para permitir reintentar.
  }
  return { ok: false, mensaje: "No pudimos atender la solicitud. Revisa tu conexión e inténtalo otra vez." };
}
