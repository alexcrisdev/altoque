import { LIMITES, type ItemPedido } from "./tipos";

export type ProductoVigente = {
  id: string;
  nombre: string;
  precioCentimos: number;
  activo: boolean;
  disponible: boolean;
};

export type LineaValidada = {
  productoId: string;
  nombre: string;
  cantidad: number;
  observacion: string | null;
  precioUnitarioCentimos: number;
  subtotalCentimos: number;
};

export type ProblemaPedido = {
  productoId: string;
  nombre?: string;
} & (
  | { motivo: "NO_EXISTE" | "INACTIVO" | "AGOTADO" }
  | { motivo: "PRECIO_CAMBIO"; precioActualCentimos: number }
);

export type ResultadoValidacionItems =
  | { ok: true; lineas: LineaValidada[]; totalCentimos: number }
  | { ok: false; problemas: ProblemaPedido[] };

const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const moneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function aCentimos(precio: number | string): number {
  return Math.round(Number(precio) * 100);
}

export function validarEstructura(entrada: unknown): ItemPedido[] | null {
  if (
    !Array.isArray(entrada) ||
    entrada.length < 1 ||
    entrada.length > LIMITES.itemsMax
  ) {
    return null;
  }

  const items: ItemPedido[] = [];
  for (const item of entrada) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }

    const { productoId, cantidad, observacion, precioMostradoCentimos } = item;
    if (
      typeof productoId !== "string" ||
      !formatoUuid.test(productoId) ||
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < LIMITES.cantidadMin ||
      cantidad > LIMITES.cantidadMax ||
      (observacion !== null && typeof observacion !== "string") ||
      typeof precioMostradoCentimos !== "number" ||
      !Number.isSafeInteger(precioMostradoCentimos) ||
      precioMostradoCentimos < 0
    ) {
      return null;
    }

    const observacionRecortada = observacion === null ? null : observacion.trim();
    if (
      observacionRecortada !== null &&
      observacionRecortada.length > LIMITES.observacionMax
    ) {
      return null;
    }

    // Copiar solo los campos del contrato; descartar totales y otros datos del navegador.
    items.push({
      productoId: productoId.toLowerCase(),
      cantidad,
      observacion: observacionRecortada,
      precioMostradoCentimos,
    });
  }

  return items;
}

// Recibe ítems que ya pasaron validarEstructura y precios vigentes del servidor.
export function validarItems(
  items: ItemPedido[],
  productos: ProductoVigente[],
): ResultadoValidacionItems {
  const porId = new Map(productos.map((producto) => [producto.id.toLowerCase(), producto]));
  const problemas: ProblemaPedido[] = [];
  const lineas: LineaValidada[] = [];
  let totalCentimos = 0;

  for (const item of items) {
    const producto = porId.get(item.productoId.toLowerCase());
    if (!producto) {
      problemas.push({ productoId: item.productoId, motivo: "NO_EXISTE" });
      continue;
    }

    const referencia = { productoId: item.productoId, nombre: producto.nombre };
    if (!producto.activo) problemas.push({ ...referencia, motivo: "INACTIVO" });
    if (!producto.disponible) problemas.push({ ...referencia, motivo: "AGOTADO" });
    if (item.precioMostradoCentimos !== producto.precioCentimos) {
      problemas.push({
        ...referencia,
        motivo: "PRECIO_CAMBIO",
        precioActualCentimos: producto.precioCentimos,
      });
    }

    // El precio mostrado solo se compara; los importes usan el precio vigente.
    const subtotalCentimos = producto.precioCentimos * item.cantidad;
    lineas.push({
      ...referencia,
      cantidad: item.cantidad,
      observacion: item.observacion,
      precioUnitarioCentimos: producto.precioCentimos,
      subtotalCentimos,
    });
    totalCentimos += subtotalCentimos;
  }

  // Si algo falla, no devolver líneas ni totales que puedan confundirse con un pedido válido.
  return problemas.length
    ? { ok: false, problemas }
    : { ok: true, lineas, totalCentimos };
}

export function mensajeProblema(problema: ProblemaPedido): string {
  const nombre = problema.nombre ?? "El producto";
  switch (problema.motivo) {
    case "NO_EXISTE":
      return `${nombre} ya no existe en la carta de este restaurante.`;
    case "INACTIVO":
      return `${nombre} ya no está activo en la carta.`;
    case "AGOTADO":
      return `${nombre} está agotado.`;
    case "PRECIO_CAMBIO":
      return `El precio de ${nombre} cambió a ${moneda.format(problema.precioActualCentimos / 100)}.`;
  }
}
