import type { EstadoPedido } from "./estados";

export const MENSAJE_ESTADO_CLIENTE: Record<EstadoPedido, string> = {
  PENDING: "Recibimos tu pedido, en breve lo confirmamos",
  ACCEPTED: "Tu pedido fue aceptado",
  IN_PROGRESS: "Estamos preparando tu pedido",
  READY: "¡Tu pedido está listo!",
  DELIVERED: "Pedido entregado. ¡Buen provecho!",
  CANCELLED: "Tu pedido fue cancelado",
};

type PasoPedido = 1 | 2 | 3 | 4;

export function mensajeEstadoCliente(
  estado: EstadoPedido,
  modalidad: "DINE_IN" | "TAKEAWAY",
): string {
  if (estado === "READY") {
    return modalidad === "TAKEAWAY"
      ? "Recógelo en el mostrador"
      : "Tu pedido está listo, el mesero te lo lleva";
  }
  return MENSAJE_ESTADO_CLIENTE[estado];
}

const PASO_ESTADO: Record<EstadoPedido, PasoPedido | null> = {
  PENDING: 1,
  ACCEPTED: 2,
  IN_PROGRESS: 3,
  READY: 4,
  DELIVERED: 4,
  CANCELLED: null,
};

export function pasoDelPedido(
  estado: EstadoPedido,
): PasoPedido | null {
  return PASO_ESTADO[estado];
}

export type PedidoGuardado = {
  clave: string;
  numero: number;
  creadoEn: string;
};

const DURACION_PEDIDO_MS = 12 * 60 * 60 * 1000;
const MAXIMO_PEDIDOS = 10;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// localStorage puede contener información dañada o de una versión anterior.
function esPedidoGuardado(valor: unknown): valor is PedidoGuardado {
  if (typeof valor !== "object" || valor === null) return false;

  const pedido = valor as Record<string, unknown>;

  return (
    typeof pedido.clave === "string" &&
    UUID.test(pedido.clave) &&
    typeof pedido.numero === "number" &&
    Number.isSafeInteger(pedido.numero) &&
    pedido.numero > 0 &&
    typeof pedido.creadoEn === "string" &&
    Number.isFinite(Date.parse(pedido.creadoEn))
  );
}

export function descartarAntiguos(
  lista: readonly unknown[],
  ahora: number,
): PedidoGuardado[] {
  if (!Number.isFinite(ahora)) return [];

  return lista.filter((valor): valor is PedidoGuardado => {
    if (!esPedidoGuardado(valor)) return false;

    const antiguedad = ahora - Date.parse(valor.creadoEn);

    // Conserva los de exactamente 12 horas, pero no fechas futuras.
    return antiguedad >= 0 && antiguedad <= DURACION_PEDIDO_MS;
  });
}

export function agregarPedidoGuardado(
  lista: readonly unknown[],
  nuevo: PedidoGuardado,
  ahora: number,
): PedidoGuardado[] {
  const vigentes = descartarAntiguos([nuevo, ...lista], ahora);

  // La primera aparición de una clave es la que se conserva.
  const unicos = new Map<string, PedidoGuardado>();

  for (const pedido of vigentes) {
    const clave = pedido.clave.toLowerCase();

    if (!unicos.has(clave)) {
      unicos.set(clave, pedido);
    }
  }

  return [...unicos.values()]
    .sort(
      (primero, segundo) =>
        Date.parse(segundo.creadoEn) - Date.parse(primero.creadoEn),
    )
    .slice(0, MAXIMO_PEDIDOS);
}
