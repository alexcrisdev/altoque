import type { EstadoPedido } from "./estados";
import type { Rol } from "@/features/auth/permisos";

export type TipoIncidencia = "FALTANTE" | "ERROR" | "RECLAMO" | "OTRO" | "SIN_INGREDIENTES" | "PROBLEMA_PREPARACION";
export const ETIQUETA_TIPO_INCIDENCIA: Record<TipoIncidencia, string> = {
  FALTANTE: "Faltante", ERROR: "Error", RECLAMO: "Reclamo", OTRO: "Otro",
  SIN_INGREDIENTES: "Sin ingredientes", PROBLEMA_PREPARACION: "Problema de preparación",
};

const ROLES_INCIDENCIAS: Rol[] = ["WAITER", "KITCHEN", "OWNER", "ADMIN"];

export function puedeGestionarIncidencias(roles: readonly Rol[]): boolean {
  return roles.some((rol) => ROLES_INCIDENCIAS.includes(rol));
}

export function validarIncidencia(tipo: unknown, descripcion: unknown): string | null {
  if (typeof tipo !== "string" || !Object.hasOwn(ETIQUETA_TIPO_INCIDENCIA, tipo)) return "Elige un tipo de incidencia válido.";
  if (typeof descripcion !== "string" || descripcion.trim().length < 3 || descripcion.trim().length > 300) {
    return "La descripción debe tener entre 3 y 300 caracteres.";
  }
  return null;
}

export function mensajeErrorIncidencia(codigo: string): string {
  const mensajes: Record<string, string> = {
    FORBIDDEN: "No tienes permiso para gestionar incidencias de este pedido.",
    ORDER_NOT_FOUND: "No encontramos ese pedido.",
    INVALID_INCIDENT: "Revisa el tipo y la descripción (3 a 300 caracteres).",
    ALREADY_RESOLVED: "Esta incidencia ya está resuelta.",
  };
  return mensajes[codigo] ?? "No se pudo guardar la incidencia. Intenta de nuevo.";
}

export function puedeMarcarEntregado(estado: EstadoPedido): boolean {
  return estado === "READY";
}
