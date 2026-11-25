"use server";

import { leerCorreoBoleta } from "./comprobante-logica";
import { revalidatePath } from "next/cache";
import { obtenerSesion } from "../auth/sesion";
import { ROLES_POR_PANEL, puedeEntrar } from "../auth/permisos";
import { esUuid } from "../mesero/solicitud-asistida";
import {
  mensajeErrorPago,
  normalizarReferencia,
  parsearSoles,
  puedeVerificarPagos,
  validarPagoEfectivo,
  validarPagoTarjeta,
  validarPagoYape,
  type CuentaACobrar,
} from "./pago-logica";
import { registrarPagoEfectivo, registrarPagoTarjeta, registrarPagoYape, verificarPago } from "./pagos";
import {
  mensajeErrorCierre,
  normalizarMotivo,
  puedeAutorizarExcepcion,
  validarMotivo,
  type TipoCierre,
} from "./cierre-logica";
import { cerrarCuenta } from "./cierres";
import { programarAvisoPago } from "./aviso-n8n";
import { limpiarCapturas } from "./capturas";

export type RespuestaPago =
  | { ok: true; vueltoCentimos: number }
  | { ok: false; mensaje: string };

// US-106: solo caja registra pagos (el mesero ya no cobra; dueño y admin solo consultan).
async function puedeCobrar() {
  const sesion = await obtenerSesion();
  return !!sesion && puedeEntrar(sesion.membresias.map((m) => m.rol), "caja");
}

function datosValidos(cuenta: CuentaACobrar, clave: unknown): clave is string {
  return !!cuenta && (cuenta.tipo === "MESA" || cuenta.tipo === "PARA_LLEVAR") && esUuid(cuenta.id) &&
    typeof clave === "string" && esUuid(clave);
}

function refrescarCaja(cuenta: CuentaACobrar) {
  revalidatePath("/caja");
  revalidatePath(cuenta.tipo === "MESA" ? `/caja/mesa/${cuenta.id}` : `/caja/pedido/${cuenta.id}`);
}

// US-022: registrar un pago en efectivo. El navegador solo manda la cuenta, los
// montos escritos y la clave del intento; el saldo lo revisa la base.
export async function registrarPagoEfectivoAction(
  cuenta: CuentaACobrar,
  monto: unknown,
  recibido: unknown,
  clave: unknown,
  correo: unknown = null,
): Promise<RespuestaPago> {
  if (!(await puedeCobrar())) return { ok: false, mensaje: mensajeErrorPago("FORBIDDEN") };
  if (!datosValidos(cuenta, clave)) return { ok: false, mensaje: mensajeErrorPago("INVALID_PAYMENT") };

  const email = leerCorreoBoleta(correo);
  if (!email.ok) return email;
  const montoCentimos = parsearSoles(monto);
  const recibidoCentimos = parsearSoles(recibido);
  // Aquí no conocemos el saldo (lo valida la base); solo revisamos el formato.
  const invalido = validarPagoEfectivo(montoCentimos, recibidoCentimos, Number.MAX_SAFE_INTEGER);
  if (invalido) return { ok: false, mensaje: invalido };

  const resultado = await registrarPagoEfectivo(cuenta, montoCentimos!, recibidoCentimos!, clave, email.correo);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorPago(resultado.codigo) };

  refrescarCaja(cuenta);
  // US-086: el efectivo queda confirmado al registrarlo.
  if (resultado.estado === "CONFIRMED") programarAvisoPago(resultado.pagoId);
  return { ok: true, vueltoCentimos: resultado.vueltoCentimos };
}

// US-023: registrar un pago Yape. Queda "Por verificar" y no baja el saldo.
export async function registrarPagoYapeAction(
  cuenta: CuentaACobrar,
  monto: unknown,
  referencia: unknown,
  clave: unknown,
  correo: unknown = null,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (!(await puedeCobrar())) return { ok: false, mensaje: mensajeErrorPago("FORBIDDEN") };
  if (!datosValidos(cuenta, clave)) return { ok: false, mensaje: mensajeErrorPago("INVALID_PAYMENT") };

  const email = leerCorreoBoleta(correo);
  if (!email.ok) return email;
  const montoCentimos = parsearSoles(monto);
  const referenciaLimpia = normalizarReferencia(referencia);
  const invalido = validarPagoYape(montoCentimos, referenciaLimpia, Number.MAX_SAFE_INTEGER);
  if (invalido) return { ok: false, mensaje: invalido };

  const resultado = await registrarPagoYape(cuenta, montoCentimos!, referenciaLimpia!, clave, email.correo);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorPago(resultado.codigo) };
  refrescarCaja(cuenta);
  return { ok: true };
}

// US-024: registrar el resultado de un pago con tarjeta hecho en el POS. Un rechazo
// también se guarda (queda en el historial), pero no baja el saldo.
export async function registrarPagoTarjetaAction(
  cuenta: CuentaACobrar,
  monto: unknown,
  referencia: unknown,
  aprobado: unknown,
  clave: unknown,
  correo: unknown = null,
): Promise<{ ok: true; aprobado: boolean } | { ok: false; mensaje: string }> {
  if (!(await puedeCobrar())) return { ok: false, mensaje: mensajeErrorPago("FORBIDDEN") };
  if (!datosValidos(cuenta, clave)) return { ok: false, mensaje: mensajeErrorPago("INVALID_PAYMENT") };

  const email = leerCorreoBoleta(correo);
  if (!email.ok) return email;
  const montoCentimos = parsearSoles(monto);
  const resultadoPos = typeof aprobado === "boolean" ? aprobado : null;
  const invalido = validarPagoTarjeta(montoCentimos, referencia, resultadoPos, Number.MAX_SAFE_INTEGER);
  if (invalido) return { ok: false, mensaje: invalido };

  const resultado = await registrarPagoTarjeta(cuenta, montoCentimos!, normalizarReferencia(referencia)!, resultadoPos!, clave, email.correo);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorPago(resultado.codigo) };
  refrescarCaja(cuenta);
  // US-086: solo el voucher aprobado es un pago confirmado; el rechazado no avisa.
  if (resultado.estado === "CONFIRMED") programarAvisoPago(resultado.pagoId);
  // Si era un reintento, la base devuelve el pago ya guardado: su estado manda.
  return { ok: true, aprobado: resultado.estado === "CONFIRMED" };
}

// US-023: confirmar (llegó al Yape del negocio) o rechazar un pago Yape pendiente.
// Solo caja, dueño o admin; la base guarda quién y cuándo.
export async function verificarPagoAction(
  cuenta: CuentaACobrar,
  pagoId: unknown,
  confirmar: unknown,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const sesion = await obtenerSesion();
  if (!sesion || !puedeVerificarPagos(sesion.membresias.map((m) => m.rol))) {
    return { ok: false, mensaje: "Solo caja puede verificar pagos Yape." };
  }
  if (!esUuid(pagoId) || typeof confirmar !== "boolean" || !cuenta || !esUuid(cuenta.id)) {
    return { ok: false, mensaje: mensajeErrorPago("INVALID_PAYMENT") };
  }
  const resultado = await verificarPago(pagoId, confirmar);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorPago(resultado.codigo) };
  refrescarCaja(cuenta);
  // US-086: el Yape cuenta como pago recién cuando caja confirma que llegó.
  if (resultado.estado === "CONFIRMED") programarAvisoPago(pagoId);
  return { ok: true };
}

// US-020: cerrar la cuenta. Sin motivo es un cierre ordinario (saldo en cero); con
// motivo es una excepción. La base vuelve a revisar saldo, pagos por verificar y
// permisos, y guarda quién, cuándo e importes.
// US-106: el cierre ordinario es de caja; la excepción, solo del dueño o el admin
// (desde /admin/cuentas).
export async function cerrarCuentaAction(
  cuenta: CuentaACobrar,
  motivo: unknown,
): Promise<{ ok: true; tipo: TipoCierre } | { ok: false; mensaje: string }> {
  const sesion = await obtenerSesion();
  const motivoLimpio = normalizarMotivo(motivo);
  const panel = motivoLimpio === null ? "caja" : "admin";
  const membresia = sesion?.membresias.find((m) => ROLES_POR_PANEL[panel].includes(m.rol));
  if (!sesion || !membresia) {
    return { ok: false, mensaje: mensajeErrorCierre(panel === "admin" ? "EXCEPTION_FORBIDDEN" : "FORBIDDEN") };
  }
  if (!cuenta || (cuenta.tipo !== "MESA" && cuenta.tipo !== "PARA_LLEVAR") || !esUuid(cuenta.id)) {
    return { ok: false, mensaje: mensajeErrorCierre("INVALID_CLOSURE") };
  }

  if (motivoLimpio !== null) {
    const roles = sesion.membresias.filter((m) => m.restaurantId === membresia.restaurantId).map((m) => m.rol);
    if (!puedeAutorizarExcepcion(roles)) return { ok: false, mensaje: mensajeErrorCierre("EXCEPTION_FORBIDDEN") };
    const invalido = validarMotivo(motivoLimpio);
    if (invalido) return { ok: false, mensaje: invalido };
  }

  const resultado = await cerrarCuenta(cuenta, motivoLimpio);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorCierre(resultado.codigo) };
  await limpiarCapturas(membresia.restaurantId, cuenta).catch(() => console.error("US-102: limpieza del cierre pendiente"));
  refrescarCaja(cuenta);
  revalidatePath("/admin/cuentas", "layout");
  if (cuenta.tipo === "MESA") revalidatePath("/mesero");
  return { ok: true, tipo: resultado.tipo };
}
