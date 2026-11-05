import type { Rol } from "@/features/auth/permisos";

export type EstadoPedido = "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";
export type TonoEstado = "neutro" | "info" | "aviso" | "progreso" | "exito" | "peligro";

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  IN_PROGRESS: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export const TONO_ESTADO: Record<EstadoPedido, TonoEstado> = {
  PENDING: "aviso",
  ACCEPTED: "info",
  IN_PROGRESS: "progreso",
  READY: "exito",
  DELIVERED: "neutro",
  CANCELLED: "peligro",
};

export const ESTADOS_ACTIVOS: EstadoPedido[] = ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY"];

const rolesPorTransicion: Partial<Record<`${EstadoPedido}:${EstadoPedido}`, Rol[]>> = {
  "PENDING:ACCEPTED": ["KITCHEN", "OWNER", "ADMIN"],
  "ACCEPTED:IN_PROGRESS": ["KITCHEN", "OWNER", "ADMIN"],
  "IN_PROGRESS:READY": ["KITCHEN", "OWNER", "ADMIN"],
  "READY:DELIVERED": ["WAITER", "OWNER", "ADMIN"],
  "PENDING:CANCELLED": ["WAITER", "OWNER", "ADMIN"],
  "ACCEPTED:CANCELLED": ["WAITER", "OWNER", "ADMIN"],
  "IN_PROGRESS:CANCELLED": ["OWNER", "ADMIN"],
};

export function puedeCambiarEstado(desde: EstadoPedido, hacia: EstadoPedido, roles: Rol[]): boolean {
  const permitidos = rolesPorTransicion[`${desde}:${hacia}`];
  return !!permitidos && roles.some((rol) => permitidos.includes(rol));
}

export function requiereMotivo(hacia: EstadoPedido): boolean {
  return hacia === "CANCELLED";
}

export function mensajeErrorEstado(codigo: string): string {
  const mensajes: Record<string, string> = {
    ORDER_NOT_FOUND: "No encontramos ese pedido.",
    INVALID_TRANSITION: "Ese cambio de estado no está permitido.",
    FORBIDDEN: "No tienes permiso para cambiar el estado de este pedido.",
    REASON_REQUIRED: "Escribe el motivo de la cancelación.",
    INVALID_REASON: "El motivo no puede superar los 200 caracteres.",
  };
  return mensajes[codigo] ?? "No se pudo actualizar el estado del pedido. Intenta de nuevo.";
}
