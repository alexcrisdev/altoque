// US-105: devoluciones de pedidos pagados que el dueño o el admin cancelaron.

export type EstadoDevolucion = "PENDING" | "REFUNDED";

export type Devolucion = {
  id: string;
  pedidoId: string;
  numeroPedido: number;
  fechaPedido: string | null;
  montoCentimos: number;
  motivo: string;
  estado: EstadoDevolucion;
  solicitadaPor: string | null;
  solicitadaEn: string;
  devueltaPor: string | null;
  devueltaEn: string | null;
};

export const ETIQUETA_DEVOLUCION: Record<EstadoDevolucion, string> = {
  PENDING: "Devolución pendiente",
  REFUNDED: "Devuelta",
};

// Caja, dueño o admin marcan la devolución como hecha (la base guarda quién).
const ROLES_DEVOLUCION = ["CASHIER", "OWNER", "ADMIN"] as const;
export function puedeMarcarDevolucion(roles: readonly string[]): boolean {
  return roles.some((rol) => (ROLES_DEVOLUCION as readonly string[]).includes(rol));
}

export function mensajeErrorDevolucion(codigo: string): string {
  const mensajes: Record<string, string> = {
    FORBIDDEN: "No tienes permiso para marcar devoluciones.",
    REFUND_NOT_FOUND: "No encontramos esa devolución. Actualiza la página.",
    ALREADY_REFUNDED: "Otra persona ya marcó esta devolución como hecha.",
  };
  return mensajes[codigo] ?? "No se pudo marcar la devolución. Intenta de nuevo.";
}
