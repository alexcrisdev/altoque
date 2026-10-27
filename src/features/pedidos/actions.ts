"use server";

import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { validarModalidad } from "./modalidad";
import { obtenerConfigParaLlevar } from "./para-llevar";
import { buscarPedidoIdempotente, guardarPedidoQr } from "./registro";
import { validarPedido } from "./validar-pedido";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResultadoRegistroPedido =
  | { ok: true; numero: number }
  | { ok: false; mensaje: string; problemas?: { nombre?: string; motivo: string; precioActualCentimos?: number }[] };

export async function registrarPedidoQrAction(
  token: string,
  clave: string,
  entrada: unknown,
  // US-002: { modalidad, nombre, telefono }. Si no llega, se usa la modalidad del QR.
  opciones?: unknown,
): Promise<ResultadoRegistroPedido> {
  if (typeof token !== "string" || !uuid.test(clave)) {
    return { ok: false, mensaje: "No se pudo validar la solicitud. Recarga la carta e inténtalo otra vez." };
  }

  const acceso = await resolverAccesoQr(token);
  if (acceso.estado !== "VALIDO") {
    return { ok: false, mensaje: "Este código QR ya no está disponible. Pide ayuda al personal." };
  }

  if (acceso.modalidad === "DINE_IN" && acceso.mesa === null) {
    return { ok: false, mensaje: "No se pudo identificar la mesa de este código QR." };
  }

  let config;
  try {
    config = await obtenerConfigParaLlevar(acceso.restauranteId);
  } catch {
    return { ok: false, mensaje: "No se pudo verificar el pedido. Intenta de nuevo." };
  }
  const modalidad = validarModalidad(opciones, acceso.modalidad, config);
  if (!modalidad.ok) return { ok: false, mensaje: modalidad.mensaje };

  try {
    const pedidoPrevio = await buscarPedidoIdempotente(acceso.qrId, clave);
    if (pedidoPrevio) return { ok: true, numero: pedidoPrevio.numero };
  } catch {
    return { ok: false, mensaje: "No se pudo verificar el pedido. Intenta de nuevo." };
  }

  const validacion = await validarPedido(acceso.restauranteId, entrada);
  if (!validacion.ok) {
    return validacion.problemas.length
      ? { ok: false, mensaje: "Revisa los productos marcados antes de confirmar.", problemas: validacion.problemas }
      : { ok: false, mensaje: "El pedido contiene datos inválidos." };
  }

  try {
    const pedido = await guardarPedidoQr(acceso.qrId, clave, validacion.lineas, {
      modalidad: modalidad.modalidad,
      nombre: modalidad.nombre,
      telefono: modalidad.telefono,
    });
    return { ok: true, numero: pedido.numero };
  } catch {
    return { ok: false, mensaje: "No se pudo registrar el pedido. Revisa tu conexión e inténtalo otra vez." };
  }
}
