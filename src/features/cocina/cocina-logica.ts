import { ESTADOS_ACTIVOS, type EstadoPedido } from "../pedidos/estados";
import type { PedidoCocina } from "./tipos";

export type EstadoActivo = Extract<EstadoPedido, "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "READY">;
export type FiltroCocina = "TODOS" | EstadoActivo;

export function normalizarFiltro(filtro: unknown): FiltroCocina {
  return typeof filtro === "string" && ESTADOS_ACTIVOS.includes(filtro as EstadoPedido)
    ? filtro as EstadoActivo : "TODOS";
}

export function ordenarPorLlegada(pedidos: PedidoCocina[]): PedidoCocina[] {
  return [...pedidos].sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn));
}

export function agruparPorEstado(pedidos: PedidoCocina[]) {
  const ordenados = ordenarPorLlegada(pedidos);
  return {
    PENDING: ordenados.filter((p) => p.estado === "PENDING"),
    ACCEPTED: ordenados.filter((p) => p.estado === "ACCEPTED"),
    IN_PROGRESS: ordenados.filter((p) => p.estado === "IN_PROGRESS"),
    READY: ordenados.filter((p) => p.estado === "READY"),
  };
}

export function filtrarPorEstado(pedidos: PedidoCocina[], filtro: unknown): PedidoCocina[] {
  const estado = normalizarFiltro(filtro);
  return ordenarPorLlegada(pedidos.filter((pedido) =>
    estado === "TODOS" ? ESTADOS_ACTIVOS.includes(pedido.estado) : pedido.estado === estado,
  ));
}

export function minutosDesde(fechaIso: string, ahora: string | number | Date): number {
  const diferencia = new Date(ahora).getTime() - Date.parse(fechaIso);
  return Number.isFinite(diferencia) ? Math.max(0, Math.floor(diferencia / 60_000)) : 0;
}