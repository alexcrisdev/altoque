"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion } from "../auth/sesion";
import { tienePermiso } from "../auth/permisos";
import { esUuid } from "../mesero/solicitud-asistida";
import { mensajeErrorPago, parsearSoles, validarPagoEfectivo, type CuentaACobrar } from "./pago-logica";
import { registrarPagoEfectivo } from "./pagos";

export type RespuestaPago =
  | { ok: true; vueltoCentimos: number }
  | { ok: false; mensaje: string };

// US-022: registrar un pago en efectivo. El navegador solo manda la cuenta, los
// montos escritos y la clave del intento; el saldo lo revisa la base.
export async function registrarPagoEfectivoAction(
  cuenta: CuentaACobrar,
  monto: unknown,
  recibido: unknown,
  clave: unknown,
): Promise<RespuestaPago> {
  const sesion = await obtenerSesion();
  if (!sesion || !sesion.membresias.some((m) => tienePermiso(m.rol, "registrar_pagos"))) {
    return { ok: false, mensaje: mensajeErrorPago("FORBIDDEN") };
  }
  if (!cuenta || (cuenta.tipo !== "MESA" && cuenta.tipo !== "PARA_LLEVAR") || !esUuid(cuenta.id) ||
      typeof clave !== "string" || !esUuid(clave)) {
    return { ok: false, mensaje: mensajeErrorPago("INVALID_PAYMENT") };
  }

  const montoCentimos = parsearSoles(monto);
  const recibidoCentimos = parsearSoles(recibido);
  // Aquí no conocemos el saldo (lo valida la base); solo revisamos el formato.
  const invalido = validarPagoEfectivo(montoCentimos, recibidoCentimos, Number.MAX_SAFE_INTEGER);
  if (invalido) return { ok: false, mensaje: invalido };

  const resultado = await registrarPagoEfectivo(cuenta, montoCentimos!, recibidoCentimos!, clave);
  if (!resultado.ok) return { ok: false, mensaje: mensajeErrorPago(resultado.codigo) };

  revalidatePath("/caja");
  revalidatePath(cuenta.tipo === "MESA" ? `/caja/mesa/${cuenta.id}` : `/caja/pedido/${cuenta.id}`);
  return { ok: true, vueltoCentimos: resultado.vueltoCentimos };
}
