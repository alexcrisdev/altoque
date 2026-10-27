"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import type { ResultadoRegistroPedido } from "@/features/pedidos/actions";
import { validarPedido } from "@/features/pedidos/validar-pedido";
import { buscarPedidoAsistido, guardarPedidoAsistido } from "./pedido-asistido";
import { abrirSesion, cerrarSesion } from "./sesiones";
import { esUuid, mensajeRechazo, validarSolicitudAsistida } from "./solicitud-asistida";

type EstadoAccion = { tipo: "inicial" | "exito" | "error"; mensaje: string };
const ROLES_MESERO = ["WAITER", "OWNER", "ADMIN"] as const;

function obtenerRestaurante(sesion: Awaited<ReturnType<typeof requerirRol>>): string {
  const membresia = sesion.membresias.find((m) => ROLES_MESERO.includes(m.rol as (typeof ROLES_MESERO)[number]));
  if (!membresia) throw new Error("No se encontró un restaurante disponible");
  return membresia.restaurantId;
}

export async function abrirSesionAction(
  _estado: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirRol(ROLES_MESERO);
  const restauranteId = obtenerRestaurante(sesion);
  const mesaId = String(formData.get("mesaId") ?? "");
  if (!mesaId) return { tipo: "error", mensaje: "Selecciona una mesa válida." };

  const resultado = await abrirSesion(restauranteId, mesaId, sesion.usuario.id);
  if (resultado.ok) {
    refresh();
    return { tipo: "exito", mensaje: "Sesión abierta." };
  }
  if (resultado.motivo === "SESION_DUPLICADA") {
    return { tipo: "error", mensaje: "La mesa ya tiene una sesión abierta" };
  }
  if (resultado.motivo === "MESA_NO_DISPONIBLE") {
    return { tipo: "error", mensaje: "La mesa no está disponible para abrir una sesión." };
  }
  return { tipo: "error", mensaje: "No se pudo abrir la sesión. Inténtalo de nuevo." };
}

export async function cerrarSesionAction(
  _estado: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirRol(ROLES_MESERO);
  const restauranteId = obtenerRestaurante(sesion);
  const sesionId = String(formData.get("sesionId") ?? "");
  if (!sesionId) return { tipo: "error", mensaje: "No se encontró una sesión válida." };

  // TODO US-020: exigir que la cuenta esté pagada antes de cerrar la sesión.
  const resultado = await cerrarSesion(restauranteId, sesionId, sesion.usuario.id);
  if (resultado.ok) {
    refresh();
    return { tipo: "exito", mensaje: "Sesión cerrada." };
  }
  if (resultado.motivo === "NO_ENCONTRADA") {
    return { tipo: "error", mensaje: "No se encontró una sesión abierta para esa mesa." };
  }
  return { tipo: "error", mensaje: "No se pudo cerrar la sesión. Inténtalo de nuevo." };
}

// US-003: el mesero registra el pedido de un cliente sin celular o que pidió ayuda.
// El restaurante y el autor salen de la sesión; precios y disponibilidad se validan
// en el servidor igual que en un pedido por QR.
export async function registrarPedidoAsistidoAction(
  clave: string,
  solicitud: unknown,
  items: unknown,
): Promise<ResultadoRegistroPedido> {
  const sesion = await requerirRol(ROLES_MESERO);
  const restauranteId = obtenerRestaurante(sesion);

  if (!esUuid(clave)) {
    return { ok: false, mensaje: "No se pudo validar la solicitud. Recarga la página e inténtalo otra vez." };
  }

  const datos = validarSolicitudAsistida(solicitud);
  if (!datos) {
    return { ok: false, mensaje: "Elige una mesa con sesión abierta o un local para llevar." };
  }

  try {
    const previo = await buscarPedidoAsistido(sesion.usuario.id, clave);
    if (previo !== null) return { ok: true, numero: previo };
  } catch {
    return { ok: false, mensaje: "No se pudo verificar el pedido. Intenta de nuevo." };
  }

  const validacion = await validarPedido(restauranteId, items);
  if (!validacion.ok) {
    return validacion.problemas.length
      ? { ok: false, mensaje: "Revisa los productos marcados antes de registrar.", problemas: validacion.problemas }
      : { ok: false, mensaje: "El pedido contiene datos inválidos." };
  }

  const resultado = await guardarPedidoAsistido(restauranteId, clave, datos, validacion.lineas);
  if (!resultado.ok) return { ok: false, mensaje: mensajeRechazo(resultado.motivo) };
  return { ok: true, numero: resultado.numero };
}
