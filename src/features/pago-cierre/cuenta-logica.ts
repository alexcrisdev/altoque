// US-021: reglas puras de la cuenta (sin base de datos), para poder probarlas.
// Todo en céntimos para no arrastrar errores de decimales.
// Debe dar lo mismo que private.saldo_pendiente_sesion en la base.

import type { EstadoPedido } from "@/features/pedidos/estados";

export type MetodoPago = "CASH" | "YAPE" | "CARD";
export type EstadoPago = "PENDING" | "CONFIRMED" | "FAILED";

export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  CARD: "Tarjeta",
};

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  PENDING: "Por verificar",
  CONFIRMED: "Confirmado",
  FAILED: "Fallido",
};

export type LineaCuenta = {
  nombre: string;
  cantidad: number;
  precioUnitarioCentimos: number;
  observacion: string | null;
};

export type PedidoCuenta = {
  id: string;
  numero: number;
  estado: EstadoPedido;
  creadoEn: string;
  lineas: LineaCuenta[];
};

export type PagoCuenta = {
  id: string;
  metodo: MetodoPago;
  estado: EstadoPago;
  montoCentimos: number;
  creadoEn: string;
  recibidoCentimos?: number | null; // solo efectivo (US-022)
  vueltoCentimos?: number | null;
};

export type ResumenCuenta = {
  pedidos: (PedidoCuenta & { totalCentimos: number })[]; // los que se cobran
  cancelados: PedidoCuenta[]; // se muestran, pero no suman
  pagosConfirmados: PagoCuenta[];
  pagosNoVerificados: PagoCuenta[]; // pendientes o fallidos: NO bajan el saldo
  consumoCentimos: number;
  pagadoCentimos: number;
  saldoCentimos: number;
  puedeCerrar: boolean; // cierre ordinario solo con saldo 0
};

export function subtotalCentimos(linea: LineaCuenta): number {
  return linea.precioUnitarioCentimos * linea.cantidad;
}

export function totalPedidoCentimos(pedido: PedidoCuenta): number {
  return pedido.lineas.reduce((suma, linea) => suma + subtotalCentimos(linea), 0);
}

export function calcularCuenta(pedidos: readonly PedidoCuenta[], pagos: readonly PagoCuenta[]): ResumenCuenta {
  const porLlegada = [...pedidos].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  const cobrables = porLlegada
    .filter((pedido) => pedido.estado !== "CANCELLED")
    .map((pedido) => ({ ...pedido, totalCentimos: totalPedidoCentimos(pedido) }));
  const cancelados = porLlegada.filter((pedido) => pedido.estado === "CANCELLED");

  const pagosConfirmados = pagos.filter((pago) => pago.estado === "CONFIRMED");
  const pagosNoVerificados = pagos.filter((pago) => pago.estado !== "CONFIRMED");

  const consumoCentimos = cobrables.reduce((suma, pedido) => suma + pedido.totalCentimos, 0);
  const pagadoCentimos = pagosConfirmados.reduce((suma, pago) => suma + pago.montoCentimos, 0);
  const saldoCentimos = consumoCentimos - pagadoCentimos;

  return {
    pedidos: cobrables,
    cancelados,
    pagosConfirmados,
    pagosNoVerificados,
    consumoCentimos,
    pagadoCentimos,
    saldoCentimos,
    puedeCerrar: saldoCentimos <= 0,
  };
}
