export type ItemPedido = {
  // Identificador UUID del producto solicitado.
  productoId: string;
  // Unidades solicitadas para esta línea del pedido.
  cantidad: number;
  // Indicaciones del cliente; null cuando no hay observación.
  observacion: string | null;
  // Precio visto por el cliente en céntimos: solo detecta cambios, nunca calcula importes.
  precioMostradoCentimos: number;
};

// Selección local antes de confirmar el pedido.
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