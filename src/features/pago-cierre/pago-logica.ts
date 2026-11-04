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

// US-024: un número de tarjeta tiene de 13 a 19 dígitos. Si el texto tiene 13 o más
// dígitos seguidos (sin contar espacios ni guiones), no se guarda: igual que en la base
// (constraint payments_reference_sin_tarjeta).
export function pareceNumeroTarjeta(texto: unknown): boolean {
  return typeof texto === "string" && /\d{13,}/.test(texto.replace(/[\s-]/g, ""));
}

// US-023: n.º de operación de Yape (o referencia del POS en US-024). Solo letras,
// números y guiones, como en la base; sin espacios y nunca un n.º de tarjeta.
export function normalizarReferencia(texto: unknown): string | null {
  if (typeof texto !== "string" || pareceNumeroTarjeta(texto)) return null;
  const limpio = texto.trim().toUpperCase();
  return /^[A-Z0-9-]{3,40}$/.test(limpio) ? limpio : null;
}

export function validarPagoYape(
  montoCentimos: number | null,
  referencia: string | null,
  saldoCentimos: number,
): string | null {
  if (saldoCentimos <= 0) return "Esta cuenta no tiene saldo pendiente.";
  if (montoCentimos === null) return "Escribe un monto válido (por ejemplo 45.50).";
  if (montoCentimos > saldoCentimos) return "El monto no puede ser mayor que el saldo pendiente.";
  if (referencia === null) return "Escribe el n.º de operación de Yape (de 3 a 40 letras o números, sin espacios).";
  return null;
}

export const AVISO_NUMERO_TARJETA =
  "Eso parece un número de tarjeta. Por seguridad no se guarda: escribe solo la referencia del voucher (n.º de operación o código de autorización).";

// US-024: el cliente paga en el POS y el cajero anota el resultado del voucher.
// `aprobado` es true (aprobado), false (rechazado) o null (todavía no eligió).
export function validarPagoTarjeta(
  montoCentimos: number | null,
  referenciaTexto: unknown,
  aprobado: boolean | null,
  saldoCentimos: number,
): string | null {
  if (saldoCentimos <= 0) return "Esta cuenta no tiene saldo pendiente.";
  if (montoCentimos === null) return "Escribe un monto válido (por ejemplo 45.50).";
  if (montoCentimos > saldoCentimos) return "El monto no puede ser mayor que el saldo pendiente.";
  if (pareceNumeroTarjeta(referenciaTexto)) return AVISO_NUMERO_TARJETA;
  if (normalizarReferencia(referenciaTexto) === null) {
    return "Escribe la referencia del voucher del POS (de 3 a 40 letras o números, sin espacios).";
  }
  if (aprobado === null) return "Elige si el POS aprobó o rechazó el pago.";
  return null;
}

// Quién puede confirmar que un Yape llegó: caja, dueño y admin (el mesero registra, no verifica).
const ROLES_VERIFICAN = ["CASHIER", "OWNER", "ADMIN"] as const;
export function puedeVerificarPagos(roles: readonly string[]): boolean {
  return roles.some((rol) => (ROLES_VERIFICAN as readonly string[]).includes(rol));
}

const MENSAJES_ERROR: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para registrar pagos en esta cuenta.",
  ACCOUNT_NOT_FOUND: "La cuenta ya no está abierta. Vuelve a la caja y revisa.",
  NOTHING_TO_PAY: "Esta cuenta ya no tiene saldo pendiente.",
  AMOUNT_EXCEEDS_BALANCE: "El monto supera el saldo pendiente. Actualiza la página: quizá alguien ya cobró una parte.",
  INSUFFICIENT_CASH: "El efectivo recibido no alcanza para cubrir el monto a cobrar.",
  INVALID_PAYMENT: "Los datos del pago no son válidos. Revisa los montos.",
  ALREADY_VERIFIED: "Este pago ya fue verificado por otra persona. Actualiza la página.",
  PAYMENT_NOT_FOUND: "No se encontró el pago. Actualiza la página.",
  // Mensaje de la base si llegara un n.º de tarjeta (el nombre de la constraint).
  payments_reference_sin_tarjeta: AVISO_NUMERO_TARJETA,
};

export const CODIGOS_ERROR_PAGO = Object.keys(MENSAJES_ERROR);

export function mensajeErrorPago(codigo: string): string {
  return MENSAJES_ERROR[codigo] ?? "No se pudo registrar el pago. Inténtalo de nuevo.";
}
