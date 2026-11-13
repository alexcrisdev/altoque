// US-020: reglas puras del cierre de cuenta (sin base de datos), para poder probarlas.
// La base vuelve a revisar todo en cerrar_cuenta.

import { formatearPrecio } from "../carta/formato";
import type { ResumenCuenta } from "./cuenta-logica";

export type TipoCierre = "ORDINARY" | "EXCEPTION";

export type CierreCuenta = {
  tipo: TipoCierre;
  consumoCentimos: number;
  pagadoCentimos: number;
  saldoCentimos: number;
  motivo: string | null;
  cerradoPor: string | null;
  cerradoEn: string;
};

export const ETIQUETA_TIPO_CIERRE: Record<TipoCierre, string> = {
  ORDINARY: "Cierre ordinario",
  EXCEPTION: "Cierre con excepción autorizada",
};

export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 300;

// Solo el dueño o el admin autorizan cerrar una cuenta que todavía debe.
const ROLES_EXCEPCION = ["OWNER", "ADMIN"] as const;
export function puedeAutorizarExcepcion(roles: readonly string[]): boolean {
  return roles.some((rol) => (ROLES_EXCEPCION as readonly string[]).includes(rol));
}

// Quita espacios de más. Devuelve null si está vacío; si es muy corto o largo, igual lo
// devuelve y validarMotivo avisa.
export function normalizarMotivo(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

export function validarMotivo(motivo: string | null): string | null {
  if (motivo === null || motivo.length < MOTIVO_MINIMO) {
    return `Escribe el motivo de la excepción (al menos ${MOTIVO_MINIMO} caracteres).`;
  }
  if (motivo.length > MOTIVO_MAXIMO) return `El motivo no puede pasar de ${MOTIVO_MAXIMO} caracteres.`;
  return null;
}

export type EstadoCierre = {
  ordinario: boolean; // se puede cerrar normal
  excepcion: boolean; // este usuario puede cerrar con excepción
  aviso: string;
};

export function avisoPedidosSinEntregar(cantidad: number): string {
  return cantidad === 1
    ? "Hay pedidos sin entregar: falta 1. Entrégalo o cancélalo antes de cerrar la cuenta."
    : `Hay pedidos sin entregar: faltan ${cantidad}. Entrégalos o cancélalos antes de cerrar la cuenta.`;
}

// Qué cierre se permite según la cuenta y quién la mira.
// US-063: una mesa no se cierra con pedidos sin entregar (ni con excepción). Un pedido para
// llevar sí, porque se paga antes y la cocina lo sigue preparando.
export function evaluarCierre(cuenta: ResumenCuenta, autorizaExcepcion: boolean, esMesa = false): EstadoCierre {
  const porVerificar = cuenta.pagosNoVerificados.filter((pago) => pago.estado === "PENDING").length;
  if (porVerificar > 0) {
    return {
      ordinario: false,
      excepcion: false,
      aviso: `Hay ${porVerificar} pago(s) Yape por verificar. Confírmalos o recházalos antes de cerrar la cuenta.`,
    };
  }
  if (esMesa && cuenta.pedidosSinEntregar > 0) {
    return { ordinario: false, excepcion: false, aviso: avisoPedidosSinEntregar(cuenta.pedidosSinEntregar) };
  }
  if (cuenta.saldoCentimos <= 0) {
    return { ordinario: true, excepcion: false, aviso: "La cuenta está pagada: ya puedes cerrarla." };
  }
  const saldo = formatearPrecio(cuenta.saldoCentimos / 100);
  if (autorizaExcepcion) {
    return {
      ordinario: false,
      excepcion: true,
      aviso: `Queda un saldo de ${saldo}. Cobra el resto o, si hay un motivo válido, ciérrala con una excepción.`,
    };
  }
  return {
    ordinario: false,
    excepcion: false,
    aviso: `Queda un saldo de ${saldo}. Cobra el resto o pide al dueño o al administrador que autorice una excepción.`,
  };
}

// El orden importa: el código se busca dentro del mensaje de la base y
// "EXCEPTION_FORBIDDEN" contiene "FORBIDDEN", así que va primero.
const MENSAJES_ERROR: Record<string, string> = {
  EXCEPTION_FORBIDDEN: "Solo el dueño o el administrador pueden cerrar una cuenta con saldo pendiente.",
  FORBIDDEN: "No tienes permiso para cerrar cuentas en este restaurante.",
  ACCOUNT_NOT_FOUND: "La cuenta ya no está abierta. Vuelve a la caja y revisa.",
  ACCOUNT_CLOSED: "Esta cuenta ya fue cerrada.",
  PENDING_PAYMENTS: "Hay pagos Yape por verificar. Confírmalos o recházalos antes de cerrar.",
  SALDO_PENDIENTE: "La cuenta todavía tiene saldo pendiente. Actualiza la página y revisa los pagos.",
  PEDIDOS_SIN_ENTREGAR: "Hay pedidos sin entregar. Entrégalos o cancélalos antes de cerrar la cuenta.",
  EXCEPTION_NOT_NEEDED: "La cuenta ya no tiene saldo pendiente: ciérrala de forma normal.",
  REASON_REQUIRED: `Escribe el motivo de la excepción (de ${MOTIVO_MINIMO} a ${MOTIVO_MAXIMO} caracteres).`,
  INVALID_CLOSURE: "Los datos de la cuenta no son válidos. Actualiza la página.",
};

export const CODIGOS_ERROR_CIERRE = Object.keys(MENSAJES_ERROR);

export function mensajeErrorCierre(codigo: string): string {
  return MENSAJES_ERROR[codigo] ?? "No se pudo cerrar la cuenta. Inténtalo de nuevo.";
}
