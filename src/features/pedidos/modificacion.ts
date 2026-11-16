import type { Rol } from "@/features/auth/permisos";
import type { EstadoPedido } from "./estados";

export type ItemModificable = {
  id: string;
  nombre: string;
  cantidad: number;
  precioUnitarioCentimos: number;
  observacion: string | null;
};

export type CambioPedido = { itemId: string; cantidad: number; observacion?: string | null };
export type ErrorModificacion = "FORBIDDEN" | "INVALID_STATE" | "REASON_REQUIRED" | "INVALID_CHANGES" | "ORDER_EMPTY";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reglas US-011: solo cantidad, quitar producto u observación; agregar exige otro pedido.
// PENDING/ACCEPTED: WAITER, OWNER o ADMIN; IN_PROGRESS: OWNER/ADMIN y motivo obligatorio.
// READY/DELIVERED/CANCELLED no se editan y nunca se permite dejar el pedido vacío.

export function puedeModificar(estado: EstadoPedido, roles: Rol[]): boolean {
  if (estado === "PENDING" || estado === "ACCEPTED") return roles.some((r) => ["WAITER", "OWNER", "ADMIN"].includes(r));
  if (estado === "IN_PROGRESS") return roles.some((r) => r === "OWNER" || r === "ADMIN");
  return false;
}

export function requiereMotivoModificacion(estado: EstadoPedido): boolean {
  return estado === "IN_PROGRESS";
}

export function validarCambios(itemsActuales: ItemModificable[], cambios: CambioPedido[]): { ok: true } | { ok: false; codigo: ErrorModificacion } {
  if (!Array.isArray(cambios) || cambios.length === 0) return { ok: false, codigo: "INVALID_CHANGES" };
  const ids = new Set(itemsActuales.map((item) => item.id.toLowerCase()));
  const vistos = new Set<string>();
  for (const cambio of cambios) {
    if (!cambio || typeof cambio.itemId !== "string" || !UUID.test(cambio.itemId) || !ids.has(cambio.itemId.toLowerCase()) || vistos.has(cambio.itemId.toLowerCase()) || !Number.isInteger(cambio.cantidad) || cambio.cantidad < 0 || cambio.cantidad > 20 || (cambio.observacion !== undefined && cambio.observacion !== null && (typeof cambio.observacion !== "string" || cambio.observacion.trim().length > 140))) {
      return { ok: false, codigo: "INVALID_CHANGES" };
    }
    vistos.add(cambio.itemId.toLowerCase());
  }
  const removidos = new Set(cambios.filter((c) => c.cantidad === 0).map((c) => c.itemId.toLowerCase()));
  return itemsActuales.some((item) => !removidos.has(item.id.toLowerCase()))
    ? { ok: true }
    : { ok: false, codigo: "ORDER_EMPTY" };
}

export function calcularNuevoTotalCentimos(itemsActuales: ItemModificable[], cambios: CambioPedido[]): number {
  const porId = new Map(cambios.map((c) => [c.itemId.toLowerCase(), c]));
  return itemsActuales.reduce((total, item) => {
    const cambio = porId.get(item.id.toLowerCase());
    return total + item.precioUnitarioCentimos * (cambio ? cambio.cantidad : item.cantidad);
  }, 0);
}

export function mensajeErrorModificacion(codigo: string): string {
  const mensajes: Record<string, string> = {
    FORBIDDEN: "No tienes permiso para modificar este pedido.",
    INVALID_STATE: "Este pedido ya no se puede modificar.",
    REASON_REQUIRED: "Escribe el motivo para modificar un pedido en preparación.",
    INVALID_CHANGES: "Los cambios no son válidos. Revisa productos, cantidades y observaciones.",
    ORDER_EMPTY: "El pedido debe conservar al menos un producto. Para quitar todos, cancélalo.",
    ORDER_NOT_FOUND: "No encontramos ese pedido.",
    ACCOUNT_CLOSED: "La cuenta de esta mesa ya se cerró: el pedido no se puede modificar.",
  };
  return mensajes[codigo] ?? "No se pudo modificar el pedido. Intenta de nuevo.";
}
