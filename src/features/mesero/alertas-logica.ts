import type { EstadoPedido } from "../pedidos/estados";

export function detectarNuevos<T extends { id: string; estado: EstadoPedido }>(
  idsAnteriores: ReadonlySet<string> | null,
  pedidos: readonly T[],
): T[] {
  if (idsAnteriores === null) return [];
  const encontrados = new Set<string>();
  return pedidos.filter((pedido) => {
    if (pedido.estado !== "PENDING" || idsAnteriores.has(pedido.id) || encontrados.has(pedido.id)) return false;
    encontrados.add(pedido.id);
    return true;
  });
}

export function textoAntiguedad(minutos: number): string {
  const enteros = Number.isFinite(minutos) ? Math.max(0, Math.floor(minutos)) : 0;
  if (enteros < 60) return `hace ${enteros} min`;
  if (enteros < 24 * 60) return `hace ${Math.floor(enteros / 60)} h`;
  return `hace ${Math.floor(enteros / (24 * 60))} d`;
}
