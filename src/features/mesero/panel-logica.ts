import type { EstadoPedido } from "../pedidos/estados";
import type { PedidoActivo } from "./pedidos-activos";
export { minutosDesde } from "../cocina/cocina-logica";

export const GRUPO_PARA_LLEVAR = "PARA_LLEVAR";

export function prioridadPedido(estado: EstadoPedido): number {
  if (estado === "READY") return 1;
  if (estado === "PENDING") return 2;
  if (estado === "ACCEPTED" || estado === "IN_PROGRESS") return 3;
  return 4; // Los pedidos finalizados no requieren atención en este panel.
}

export function pedidosQueRequierenAtencion(
  pedidos: readonly PedidoActivo[],
  ahora: string | number | Date,
): PedidoActivo[] {
  const instante = new Date(ahora).getTime();
  return pedidos.filter((pedido) => pedido.estado === "READY"
    || (pedido.estado === "PENDING" && instante - Date.parse(pedido.creadoEn) > 5 * 60_000))
    .sort((a, b) => prioridadPedido(a.estado) - prioridadPedido(b.estado)
      || Date.parse(a.creadoEn) - Date.parse(b.creadoEn));
}

export function agruparPorMesa(pedidos: readonly PedidoActivo[]): Map<string, PedidoActivo[]> {
  const grupos = new Map<string, PedidoActivo[]>();
  for (const pedido of pedidos) {
    // Un pedido para llevar puede haberse solicitado desde el QR de una mesa.
    const clave = pedido.modalidad === "TAKEAWAY" ? GRUPO_PARA_LLEVAR : pedido.mesaId ?? "SIN_MESA";
    const grupo = grupos.get(clave) ?? [];
    grupo.push(pedido);
    grupos.set(clave, grupo);
  }
  return grupos;
}

export function resumenMesa(pedidos: readonly PedidoActivo[]) {
  return {
    total: pedidos.length,
    listos: pedidos.filter((pedido) => pedido.estado === "READY").length,
    pendientes: pedidos.filter((pedido) => pedido.estado === "PENDING").length,
  };
}
