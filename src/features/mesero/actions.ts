"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { abrirSesion, cerrarSesion } from "./sesiones";

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
