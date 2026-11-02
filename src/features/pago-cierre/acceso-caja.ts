import "server-only";
import { requerirPermiso } from "@/features/auth/sesion";
import { tienePermiso } from "@/features/auth/permisos";
import { puedeVerificarPagos } from "./pago-logica";

// US-021: solo quien tiene el permiso "registrar_pagos" (cajero, mesero,
// dueño o admin) puede ver cuentas. Devuelve el restaurante donde cobra.
export async function requerirCaja(): Promise<string> {
  const sesion = await requerirPermiso("registrar_pagos");
  const membresia = sesion.membresias.find((m) => tienePermiso(m.rol, "registrar_pagos"));
  if (!membresia) throw new Error("No se encontró un restaurante para cobrar");
  return membresia.restaurantId;
}

// US-023: además del restaurante, indica si el usuario puede verificar pagos Yape.
export async function contextoCaja(): Promise<{ restauranteId: string; puedeVerificar: boolean }> {
  const sesion = await requerirPermiso("registrar_pagos");
  const membresia = sesion.membresias.find((m) => tienePermiso(m.rol, "registrar_pagos"));
  if (!membresia) throw new Error("No se encontró un restaurante para cobrar");
  const roles = sesion.membresias.filter((m) => m.restaurantId === membresia.restaurantId).map((m) => m.rol);
  return { restauranteId: membresia.restaurantId, puedeVerificar: puedeVerificarPagos(roles) };
}
