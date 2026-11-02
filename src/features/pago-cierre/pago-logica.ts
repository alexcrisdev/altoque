// US-022: reglas puras del cobro (sin base de datos), para poder probarlas.
// Todo en céntimos. La base vuelve a validar todo en registrar_pago.

export type CuentaACobrar = { tipo: "MESA" | "PARA_LLEVAR"; id: string };

const MONTO_MAXIMO_CENTIMOS = 100_000_00; // S/ 100 000: evita errores de tipeo absurdos

// "45", "45.5", "45,50" → 4550. Vacío, negativo, letras o más de 2 decimales → null.
export function parsearSoles(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.split(".");
  const centimos = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
  return centimos > 0 && centimos <= MONTO_MAXIMO_CENTIMOS ? centimos : null;
}

// Céntimos → "45.00" (lo que se manda a la base como numeric).
export function centimosATexto(centimos: number): string {
  return (centimos / 100).toFixed(2);
}

export function calcularVuelto(montoCentimos: number, recibidoCentimos: number): number | null {
  return recibidoCentimos >= montoCentimos ? recibidoCentimos - montoCentimos : null;
}

// Devuelve el mensaje de error o null si el pago en efectivo es válido.
export function validarPagoEfectivo(
  montoCentimos: number | null,
  recibidoCentimos: number | null,
  saldoCentimos: number,
): string | null {
  if (saldoCentimos <= 0) return "Esta cuenta no tiene saldo pendiente.";
  if (montoCentimos === null) return "Escribe un monto a cobrar válido (por ejemplo 45.50).";
  if (montoCentimos > saldoCentimos) return "El monto a cobrar no puede ser mayor que el saldo pendiente.";
  if (recibidoCentimos === null) return "Escribe cuánto entregó el cliente (por ejemplo 50).";
  if (recibidoCentimos < montoCentimos) return "El efectivo recibido no alcanza para cubrir el monto a cobrar.";
  return null;
}

const MENSAJES_ERROR: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para registrar pagos en esta cuenta.",
  ACCOUNT_NOT_FOUND: "La cuenta ya no está abierta. Vuelve a la caja y revisa.",
  NOTHING_TO_PAY: "Esta cuenta ya no tiene saldo pendiente.",
  AMOUNT_EXCEEDS_BALANCE: "El monto supera el saldo pendiente. Actualiza la página: quizá alguien ya cobró una parte.",
  INSUFFICIENT_CASH: "El efectivo recibido no alcanza para cubrir el monto a cobrar.",
  INVALID_PAYMENT: "Los datos del pago no son válidos. Revisa los montos.",
};

export const CODIGOS_ERROR_PAGO = Object.keys(MENSAJES_ERROR);

export function mensajeErrorPago(codigo: string): string {
  return MENSAJES_ERROR[codigo] ?? "No se pudo registrar el pago. Inténtalo de nuevo.";
}
