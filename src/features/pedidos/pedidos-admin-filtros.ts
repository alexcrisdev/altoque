import type { PedidoAdmin } from "./pedidos-admin";

export type OrdenPedidosVista = "recientes" | "antiguos";

// Solo organiza los pedidos ya cargados para presentarlos en la pantalla.
export function filtrarYOrdenarPedidos(
  pedidos: readonly PedidoAdmin[],
  busquedaMesa: string,
  orden: OrdenPedidosVista,
): PedidoAdmin[] {
  const busqueda = busquedaMesa.trim().replace(/^mesa\s*/i, "");
  const numeroMesa = /^\d+$/.test(busqueda) ? Number(busqueda) : null;
  const direccion = orden === "recientes" ? -1 : 1;

  return pedidos
    .filter((pedido) => !busqueda || (
      numeroMesa !== null && pedido.mesaNumero === numeroMesa
    ))
    .sort((a, b) => direccion * (
      Date.parse(a.creadoEn) - Date.parse(b.creadoEn) || a.numero - b.numero
    ));
}
