import type { DisponibilidadProducto, Producto } from "../carta/tipos";
import { LIMITES, type ItemCarrito, type ItemPedido } from "./tipos";

// US-103: con pocas unidades la carta avisa «¡Quedan N!».
export const POCAS_UNIDADES = 5;

export type ProblemaLinea =
  | { tipo: "AGOTADO" }
  | { tipo: "EXCEDE"; quedan: number };

// Aplica la última consulta de stock sin tocar el resto de datos del producto.
// Un producto que ya no vino en la consulta se deja como estaba: el servidor lo valida al enviar.
export function aplicarDisponibilidad(
  productos: readonly Producto[],
  disponibilidad: ReadonlyMap<string, DisponibilidadProducto>,
): Producto[] {
  return productos.map((producto) => {
    const vivo = disponibilidad.get(producto.id);
    if (!vivo) return producto;
    return { ...producto, available: vivo.available, quedan: vivo.quedan };
  });
}

export function estaAgotado(producto: Producto): boolean {
  return !producto.available || producto.quedan === 0;
}

// Cuántas unidades más se pueden pedir (null = sin límite de stock).
function limiteStock(producto: Producto): number | null {
  return typeof producto.quedan === "number" ? producto.quedan : null;
}

export function problemaDeLinea(
  item: ItemCarrito,
  producto: Producto,
): ProblemaLinea | null {
  if (estaAgotado(producto)) return { tipo: "AGOTADO" };
  const limite = limiteStock(producto);
  if (limite !== null && item.cantidad > limite) {
    return { tipo: "EXCEDE", quedan: limite };
  }
  return null;
}

// «Enviar pedido» queda bloqueado si alguna línea está agotada, excede el stock
// o ya no aparece en la carta.
export function hayLineasConProblema(
  items: readonly ItemCarrito[],
  productos: readonly Producto[],
): boolean {
  const porId = new Map(productos.map((producto) => [producto.id, producto]));
  return items.some((item) => {
    const producto = porId.get(item.productoId);
    return !producto || problemaDeLinea(item, producto) !== null;
  });
}

// «Dejar N»: baja solo esa línea a lo que queda; si no queda nada, la quita.
export function ajustarADisponible(
  items: ItemCarrito[],
  producto: Producto,
): ItemCarrito[] {
  if (estaAgotado(producto)) return quitarDelCarrito(items, producto.id);
  const limite = limiteStock(producto);
  if (limite === null) return items;
  return items.map((item) =>
    item.productoId === producto.id && item.cantidad > limite
      ? { ...item, cantidad: limite }
      : item,
  );
}

// El precio mostrado sirve para detectar cambios; el servidor recalcula el pedido.
export function aItemsPedido(
  items: readonly ItemCarrito[],
  productos: readonly Producto[],
): ItemPedido[] {
  const porId = new Map(productos.map((producto) => [producto.id, producto]));
  return items.map((item) => {
    const producto = porId.get(item.productoId);
    if (!producto) {
      throw new Error("Un producto del carrito ya no está en la carta. Elimínalo antes de confirmar.");
    }
    return {
      productoId: item.productoId,
      cantidad: item.cantidad,
      observacion: item.observacion,
      precioMostradoCentimos: calcularSubtotalCentimos(producto.price, 1),
    };
  });
}

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
  if (estaAgotado(producto)) return items;

  const existente = items.find(
    (item) => item.productoId === producto.id,
  );
  const limite = limiteStock(producto);

  if (existente) {
    const cantidad = existente.cantidad + 1;

    if (!cantidadValida(cantidad)) return items;
    if (limite !== null && cantidad > limite) return items;

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
    if (estaAgotado(producto) && cantidad > item.cantidad) {
      return item;
    }

    // US-103: tampoco se sube por encima de lo que queda hoy.
    const limite = limiteStock(producto);
    if (limite !== null && cantidad > item.cantidad && cantidad > limite) {
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
