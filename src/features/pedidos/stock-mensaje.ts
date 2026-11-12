type ProductoPedido = { productoId: string; nombre: string };

export function mensajeStockInsuficiente(
  mensaje: string | undefined,
  productos: ProductoPedido[],
): string | null {
  if (!mensaje) return null;
  const coincidencia = mensaje.match(/STOCK_INSUFFICIENT:([0-9a-f-]{36}):(\d+)/i);
  if (!coincidencia) return null;

  const producto = productos.find(
    (item) => item.productoId.toLowerCase() === coincidencia[1].toLowerCase(),
  );
  const disponibles = Number(coincidencia[2]);
  if (!producto || !Number.isSafeInteger(disponibles)) return null;
  return `Ya no hay ${producto.nombre}, quedan ${disponibles}.`;
}
