import type { Producto } from "../carta/tipos";
import { LIMITES, type ItemCarrito } from "./tipos";

export function cantidadValida(cantidad: number): boolean {
  return (
    Number.isInteger(cantidad) &&
    cantidad >= LIMITES.cantidadMin &&
    cantidad <= LIMITES.cantidadMax
  );
}

export function agregarAlCarrito(
  items: ItemCarrito[],
  producto: Producto,
): ItemCarrito[] {
  if (!producto.available) return items;

  const existente = items.find(
    (item) => item.productoId === producto.id,
  );

  if (existente) {
    const cantidad = existente.cantidad + 1;

    if (!cantidadValida(cantidad)) return items;

    return items.map((item) =>
      item.productoId === producto.id
        ? { ...item, cantidad }
        : item,
    );
  }

  if (items.length >= LIMITES.itemsMax) return items;

  return [
    ...items,
    {
      productoId: producto.id,
      cantidad: LIMITES.cantidadMin,
      observacion: null,
    },
  ];
}

export function cambiarCantidad(
  items: ItemCarrito[],
  producto: Producto,
  cantidad: number,
): ItemCarrito[] {
  if (!cantidadValida(cantidad)) return items;

  return items.map((item) => {
    if (item.productoId !== producto.id) return item;

    // Un producto agotado puede reducirse, pero no aumentarse.
    if (!producto.available && cantidad > item.cantidad) {
      return item;
    }

    return { ...item, cantidad };
  });
}

export function quitarDelCarrito(
  items: ItemCarrito[],
  productoId: string,
): ItemCarrito[] {
  return items.filter((item) => item.productoId !== productoId);
}

export function cambiarObservacion(
  items: ItemCarrito[],
  productoId: string,
  texto: string,
  habilitada: boolean,
): ItemCarrito[] {
  if (!habilitada || texto.length > LIMITES.observacionMax) {
    return items;
  }

  const observacion = texto.trim() === "" ? null : texto;

  return items.map((item) =>
    item.productoId === productoId
      ? { ...item, observacion }
      : item,
  );
}

// Importes visuales. El servidor debe recalcularlos al confirmar.
export function calcularSubtotalCentimos(
  precio: number,
  cantidad: number,
): number {
  if (!Number.isFinite(precio) || precio < 0) {
    throw new Error("El precio no es válido.");
  }

  if (!cantidadValida(cantidad)) {
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