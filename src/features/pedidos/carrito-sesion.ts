// US-036: el carrito del cliente se guarda en sessionStorage por QR (solo en esa pestaña), para
// no perderlo si recarga mientras espera que el mesero habilite la mesa. Lógica pura, sin React.
import { LIMITES, type ItemCarrito } from "./tipos";

export const VIGENCIA_CARRITO_MS = 3 * 60 * 60 * 1000; // 3 horas
export const SEGUNDOS_REVISAR_MESA = 5;

type CarritoGuardado = { items: ItemCarrito[]; habilitada: boolean; guardadoEn: number };

export function claveCarrito(token: string): string {
  return `altoque:carrito:${token}`;
}

/** Texto para guardar; null si el carrito está vacío (entonces se borra la clave). */
export function serializarCarrito(items: readonly ItemCarrito[], habilitada: boolean, ahora: number): string | null {
  if (items.length === 0) return null;
  const guardado: CarritoGuardado = { items: [...items], habilitada, guardadoEn: ahora };
  return JSON.stringify(guardado);
}

function itemValido(item: unknown): item is ItemCarrito {
  if (typeof item !== "object" || item === null) return false;
  const i = item as Record<string, unknown>;
  return typeof i.productoId === "string" && i.productoId.length > 0
    && typeof i.cantidad === "number" && Number.isInteger(i.cantidad) && i.cantidad >= 1 && i.cantidad <= LIMITES.cantidadMax
    && (i.observacion === undefined || i.observacion === null
      || (typeof i.observacion === "string" && i.observacion.length <= LIMITES.observacionMax));
}

/**
 * Recupera el carrito guardado. Se descarta si está dañado, si es muy viejo, o si se guardó con
 * la mesa habilitada y ahora ya no lo está (la cuenta se cerró: es otra visita).
 */
export function leerCarritoGuardado(texto: string | null, habilitadaAhora: boolean, ahora: number): ItemCarrito[] {
  if (!texto) return [];
  try {
    const guardado = JSON.parse(texto) as Partial<CarritoGuardado>;
    if (!Array.isArray(guardado.items) || typeof guardado.guardadoEn !== "number") return [];
    if (ahora - guardado.guardadoEn > VIGENCIA_CARRITO_MS) return [];
    if (guardado.habilitada === true && !habilitadaAhora) return [];
    return guardado.items.filter(itemValido).slice(0, LIMITES.itemsMax)
      .map((item) => ({ productoId: item.productoId, cantidad: item.cantidad, observacion: item.observacion ?? null }));
  } catch {
    return [];
  }
}
