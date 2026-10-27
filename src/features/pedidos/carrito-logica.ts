import type { Producto } from "../carta/tipos";
import type { ItemCarrito } from "./tipos";

// El máximo se recibe como parámetro hasta acordarlo con US-008.
export function cantidadValida(
  cantidad: number,
  cantidadMaxima: number,
): boolean {
  return (
    Number.isInteger(cantidad) &&
    cantidad >= 1 &&
    cantidad <= cantidadMaxima
  );
}

// Los cálculos se hacen en céntimos.
// Estos importes son visuales; el servidor deberá recalcularlos.
export function calcularSubtotalCentimos(
  precio: number,
  cantidad: number,
): number {
  if (!Number.isFinite(precio) || precio < 0) {
    throw new Error("El precio no es válido.");
  }

  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error("La cantidad no es válida.");
  }

  return Math.round(precio * 100) * cantidad;
}

export function calcularTotalCentimos(
  items: readonly ItemCarrito[],
  productos: readonly Producto[],
): number {
  const productosPorId = new Map(
    productos.map((producto) => [producto.id, producto]),
  );

  return items.reduce((total, item) => {
    const producto = productosPorId.get(item.productoId);

    if (!producto) {
      throw new Error("Un producto del carrito ya no está en la carta.");
    }

    return total + calcularSubtotalCentimos(
      producto.price,
      item.cantidad,
    );
  }, 0);
}