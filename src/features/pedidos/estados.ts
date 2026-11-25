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

// US-106: preparar, listo y deshacer son de cocina; entregar, del mesero. Cancelar lo
// hace el mesero o, como excepción con motivo, el dueño o el admin desde /admin.
const rolesPorTransicion: Partial<Record<`${EstadoPedido}:${EstadoPedido}`, Rol[]>> = {
  "READY:IN_PROGRESS": ["KITCHEN"],
  "IN_PROGRESS:READY": ["KITCHEN"],
  "READY:DELIVERED": ["WAITER"],
  "PENDING:CANCELLED": ["WAITER", "OWNER", "ADMIN"],
  "ACCEPTED:CANCELLED": ["WAITER", "OWNER", "ADMIN"],
  "IN_PROGRESS:CANCELLED": ["WAITER", "OWNER", "ADMIN"],
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
    UNDO_EXPIRED: "Ya pasaron los cinco minutos para deshacer. El pedido sigue listo.",
    ORDER_NOT_FOUND: "No encontramos ese pedido.",
    INVALID_TRANSITION: "Ese cambio de estado no está permitido.",
    FORBIDDEN: "No tienes permiso para cambiar el estado de este pedido.",
    REASON_REQUIRED: "Escribe el motivo de la cancelación.",
    INVALID_REASON: "El motivo no puede superar los 200 caracteres.",
    ACCOUNT_CLOSED: "La cuenta de esta mesa ya se cerró: el pedido no se puede cambiar.",
  };
  return mensajes[codigo] ?? "No se pudo actualizar el estado del pedido. Intenta de nuevo.";
}
