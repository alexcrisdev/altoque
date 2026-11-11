export type EntradaStock = { productoId: unknown; cantidad: unknown };
export type CantidadStock = { productoId: string; cantidad: number | null };
export type ResultadoValidacionStock =
  | { ok: true; items: CantidadStock[] }
  | { ok: false; mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTERO_NO_NEGATIVO = /^(0|[1-9][0-9]*)$/;

export function validarStockDiario(
  entradas: EntradaStock[],
  vendidosPorProducto: ReadonlyMap<string, number>,
): ResultadoValidacionStock {
  const vistos = new Set<string>();
  const items: CantidadStock[] = [];

  for (const entrada of entradas) {
    const productoId = typeof entrada.productoId === "string" ? entrada.productoId : "";
    if (!UUID.test(productoId) || vistos.has(productoId)) {
      return { ok: false, mensaje: "No se pudieron identificar los productos del formulario." };
    }
    vistos.add(productoId);

    if (entrada.cantidad === "") {
      if ((vendidosPorProducto.get(productoId) ?? 0) > 0) {
        return { ok: false, mensaje: "No puedes quitar el límite después de registrar ventas de hoy." };
      }
      items.push({ productoId, cantidad: null });
      continue;
    }
    if (typeof entrada.cantidad !== "string" || !ENTERO_NO_NEGATIVO.test(entrada.cantidad)) {
      return { ok: false, mensaje: "Ingresa una cantidad entera igual o mayor que cero." };
    }

    const cantidad = Number(entrada.cantidad);
    if (!Number.isSafeInteger(cantidad) || cantidad > 2147483647) {
      return { ok: false, mensaje: "La cantidad indicada es demasiado grande." };
    }
    if (cantidad < (vendidosPorProducto.get(productoId) ?? 0)) {
      return { ok: false, mensaje: "La cantidad no puede ser menor a los platos ya vendidos hoy." };
    }
    items.push({ productoId, cantidad });
  }

  return { ok: true, items };
}

export function fechaActualLima(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}
