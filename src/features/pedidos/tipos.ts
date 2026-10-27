// Contrato compartido para validar el pedido en US-008.
export type ItemPedido = {
  productoId: string;
  cantidad: number;
  observacion: string | null;

  // Precio visto por el cliente, expresado en céntimos.
  // El servidor lo compara, pero calcula con sus propios precios.
  precioMostradoCentimos: number;
};

// Selección local del cliente antes de confirmar.
// Reutiliza los campos del contrato compartido.
export type ItemCarrito = Omit<
  ItemPedido,
  "precioMostradoCentimos"
>;

export const LIMITES = {
  cantidadMin: 1,
  cantidadMax: 20,
  observacionMax: 140,
  itemsMax: 30,
} as const;

// Tipos que ya existían en tu avance local.
// Se mantienen separados del contrato de validación.
export const ESTADOS_PEDIDO = [
  "PENDIENTE",
  "EN_PREPARACION",
  "LISTO",
  "ENTREGADO",
  "CANCELADO",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export type ItemPedidoRegistrado = {
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
  items: ItemPedidoRegistrado[];
};