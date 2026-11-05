import { aCentimos } from "../pedidos/validacion";
import type {
  EstadoPago,
  MetodoPago,
} from "../pago-cierre/cuenta-logica";

export type PagoVenta = {
  table_session_id: string | null;
  order_id: string | null;
  method: MetodoPago;
  status: EstadoPago;
  amount: number | string;
};

export type ResumenVentas = {
  ventasCentimos: number;
  cuentasPagadas: number;
  ticketPromedioCentimos: number;
  // Cada importe del desglose también está expresado en céntimos.
  porMetodo: Record<MetodoPago, number>;
};

const UN_DIA_MS = 24 * 60 * 60 * 1000;

function fechaValida(fecha: string): boolean {
  if (
    typeof fecha !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    fecha.startsWith("0000-")
  ) {
    return false;
  }

  const instante = Date.parse(`${fecha}T00:00:00.000Z`);

  return (
    Number.isFinite(instante) &&
    new Date(instante).toISOString().slice(0, 10) === fecha
  );
}

// Devuelve null cuando el rango es válido, o un mensaje para la pantalla.
export function validarRango(
  desde: string,
  hasta: string,
): string | null {
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return "Selecciona fechas válidas para Desde y Hasta.";
  }

  // El formato YYYY-MM-DD permite comparar las fechas como texto.
  if (desde > hasta) {
    return "La fecha Desde no puede ser posterior a Hasta.";
  }

  return null;
}

export function rangoLimaAUtc(
  desde: string,
  hasta: string,
): {
  desdeUtc: string;
  hastaUtcExclusivo: string;
} {
  const error = validarRango(desde, hasta);

  if (error) throw new Error(error);

  // Regla del reporte: Lima usa UTC-5.
  // Incluimos desde las 00:00 del primer día y excluimos
  // las 00:00 del día siguiente al último.
  const inicio = Date.parse(`${desde}T00:00:00.000-05:00`);
  const fin = Date.parse(`${hasta}T00:00:00.000-05:00`);

  return {
    desdeUtc: new Date(inicio).toISOString(),
    hastaUtcExclusivo: new Date(fin + UN_DIA_MS).toISOString(),
  };
}

// Recibe pagos del restaurante y periodo ya filtrados por la capa de datos.
// Venta: suma de pagos CONFIRMED; PENDING y FAILED no cuentan.
// Cuenta pagada: cuenta distinta con al menos un pago confirmado en el rango,
// aunque sea parcial. No significa necesariamente que su saldo sea cero.
// Ticket promedio: ventas confirmadas / cuentas pagadas, redondeado al céntimo.
export function calcularResumenVentas(
  pagos: readonly PagoVenta[],
): ResumenVentas {
  let ventasCentimos = 0;

  const cuentas = new Set<string>();

  const porMetodo: Record<MetodoPago, number> = {
    CASH: 0,
    YAPE: 0,
    CARD: 0,
  };

  for (const pago of pagos) {
    if (pago.status !== "CONFIRMED") continue;

    const tieneMesa = Boolean(pago.table_session_id);
    const tienePedido = Boolean(pago.order_id);

    // Un pago debe pertenecer a una sola clase de cuenta.
    if (tieneMesa === tienePedido) {
      throw new Error("Un pago confirmado tiene una cuenta inválida.");
    }

    if (!Object.hasOwn(porMetodo, pago.method)) {
      throw new Error("Un pago confirmado tiene un método inválido.");
    }

    const monto = aCentimos(pago.amount);

    if (!Number.isSafeInteger(monto) || monto <= 0) {
      throw new Error("Un pago confirmado tiene un monto inválido.");
    }

    const nuevoTotal = ventasCentimos + monto;
    const nuevoTotalMetodo = porMetodo[pago.method] + monto;

    if (
      !Number.isSafeInteger(nuevoTotal) ||
      !Number.isSafeInteger(nuevoTotalMetodo)
    ) {
      throw new Error("El importe supera el límite de cálculo.");
    }

    ventasCentimos = nuevoTotal;
    porMetodo[pago.method] = nuevoTotalMetodo;

    // Los prefijos distinguen una sesión de mesa de un pedido para llevar.
    cuentas.add(
      tieneMesa
        ? `mesa:${pago.table_session_id}`
        : `pedido:${pago.order_id}`,
    );
  }

  const cuentasPagadas = cuentas.size;

  return {
    ventasCentimos,
    cuentasPagadas,
    ticketPromedioCentimos:
      cuentasPagadas === 0
        ? 0
        : Math.round(ventasCentimos / cuentasPagadas),
    porMetodo,
  };
}
