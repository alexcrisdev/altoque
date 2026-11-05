import type { EstadoPedido } from "../pedidos/estados";

export type PedidoTendencia = {
  id: string;
  created_at: string;
  status: EstadoPedido;
  order_items: {
    product_id: string;
    product_name: string;
    quantity: number;
  }[];
};

export type ProductoMasVendido = {
  productId: string;
  nombre: string;
  unidades: number;
};

export type ConteoPedidos = {
  porEstado: Record<EstadoPedido, number>;
  total: number;
};

// También define el orden de presentación de los seis estados.
export const ESTADOS_TENDENCIAS: readonly EstadoPedido[] = [
  "PENDING",
  "ACCEPTED",
  "IN_PROGRESS",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

function validarPedido(pedido: PedidoTendencia): void {
  if (!ESTADOS_TENDENCIAS.includes(pedido.status)) {
    throw new Error("El estado del pedido no es válido.");
  }

  if (
    !pedido.id?.trim() ||
    !Number.isFinite(Date.parse(pedido.created_at))
  ) {
    throw new Error("Los datos del pedido no son válidos.");
  }

  if (!Array.isArray(pedido.order_items)) {
    throw new Error("Los productos del pedido no son válidos.");
  }

  for (const item of pedido.order_items) {
    if (
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error("La cantidad del producto no es válida.");
    }

    if (
      typeof item.product_id !== "string" ||
      !item.product_id.trim() ||
      typeof item.product_name !== "string" ||
      !item.product_name.trim()
    ) {
      throw new Error("Los datos del producto no son válidos.");
    }
  }
}

// Recibe pedidos del restaurante y periodo ya filtrados por la capa de datos.
// Suma unidades de todos los estados excepto CANCELLED: no depende del pago.
// Agrupa por product_id y usa el nombre del pedido no cancelado más reciente.
export function calcularProductosMasVendidos(
  pedidos: readonly PedidoTendencia[],
  limite = 5,
): ProductoMasVendido[] {
  if (!Number.isSafeInteger(limite) || limite < 1) {
    throw new Error("El límite de productos no es válido.");
  }

  const productos = new Map<
    string,
    ProductoMasVendido & {
      ultimaFecha: number;
      ultimoPedidoId: string;
    }
  >();

  for (const pedido of pedidos) {
    validarPedido(pedido);

    if (pedido.status === "CANCELLED") continue;

    const fecha = Date.parse(pedido.created_at);

    for (const item of pedido.order_items) {
      const actual = productos.get(item.product_id);

      if (!actual) {
        productos.set(item.product_id, {
          productId: item.product_id,
          nombre: item.product_name,
          unidades: item.quantity,
          ultimaFecha: fecha,
          ultimoPedidoId: pedido.id,
        });
        continue;
      }

      const unidades = actual.unidades + item.quantity;

      if (!Number.isSafeInteger(unidades)) {
        throw new Error("Las unidades superan el límite de cálculo.");
      }

      actual.unidades = unidades;

      // Si coinciden las fechas, el ID desempata de forma estable.
      const esMasReciente =
        fecha > actual.ultimaFecha ||
        (
          fecha === actual.ultimaFecha &&
          pedido.id > actual.ultimoPedidoId
        );

      if (esMasReciente) {
        actual.nombre = item.product_name;
        actual.ultimaFecha = fecha;
        actual.ultimoPedidoId = pedido.id;
      }
    }
  }

  return [...productos.values()]
    .sort((a, b) =>
      b.unidades - a.unidades ||
      a.nombre.localeCompare(b.nombre, "es") ||
      a.productId.localeCompare(b.productId),
    )
    .slice(0, limite)
    .map(({ productId, nombre, unidades }) => ({
      productId,
      nombre,
      unidades,
    }));
}

// Cuenta cada pedido una vez según su estado actual.
// Incluye cancelados y devuelve siempre los seis estados, incluso con cero.
export function contarPedidosPorEstado(
  pedidos: readonly PedidoTendencia[],
): ConteoPedidos {
  const porEstado: Record<EstadoPedido, number> = {
    PENDING: 0,
    ACCEPTED: 0,
    IN_PROGRESS: 0,
    READY: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };

  for (const pedido of pedidos) {
    validarPedido(pedido);
    porEstado[pedido.status] += 1;
  }

  return {
    porEstado,
    total: pedidos.length,
  };
}
