export const ESTADOS_PEDIDO = [
  "PENDIENTE",
  "EN_PREPARACION",
  "LISTO",
  "ENTREGADO",
  "CANCELADO",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export type ItemPedido = {
  id: string;
  pedido_id: string;
  producto_id: string;
  nombre_producto: string;
  precio_unitario: number;
  cantidad: number;
  subtotal: number;
  notas: string | null;
};

export type Pedido = {
  id: string;
  restaurante_id: string;
  mesa_id: string | null;
  codigo_confirmacion: string;
  estado: EstadoPedido;
  total: number;
  creado_en: string;
  actualizado_en: string;
  items: ItemPedido[];
};

// Selección del cliente antes de confirmar el pedido.
export type ItemCarrito = {
  productoId: string;
  cantidad: number;
  observacion: string | null;
};

// Valores propuestos por el equipo; pendientes de confirmar con US-008.
export const LIMITES = {
  cantidadMin: 1,
  cantidadMax: 20,
  observacionMax: 140,
  itemsMax: 30,
} as const;