import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { aCentimos } from "../pedidos/validacion";
import { CODIGOS_ERROR_PAGO, centimosATexto, type CuentaACobrar } from "./pago-logica";

// US-022: capa de datos del cobro. Usa la sesión del usuario: la función
// registrar_pago vuelve a revisar rol, restaurante, saldo y montos.

export type ResultadoPago =
  | { ok: true; pagoId: string; estado: string; vueltoCentimos: number }
  | { ok: false; codigo: string };

type DatosPago = {
  metodo: "CASH" | "YAPE" | "CARD";
  montoCentimos: number;
  recibidoCentimos: number | null;
  referencia: string | null;
  aprobado: boolean | null;
};

async function registrarPago(
  origen: string,
  cuenta: CuentaACobrar,
  pago: DatosPago,
  clave: string,
): Promise<ResultadoPago> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("registrar_pago", {
      p_sesion_id: cuenta.tipo === "MESA" ? cuenta.id : null,
      p_pedido_id: cuenta.tipo === "PARA_LLEVAR" ? cuenta.id : null,
      p_metodo: pago.metodo,
      p_monto: centimosATexto(pago.montoCentimos),
      p_recibido: pago.recibidoCentimos === null ? null : centimosATexto(pago.recibidoCentimos),
      p_referencia: pago.referencia,
      p_aprobado: pago.aprobado,
      p_clave: clave,
    })
    .single()
    .overrideTypes<{ pago_id: string; estado: string; vuelto: number | string | null }, { merge: false }>();

  if (error || !data) {
    const codigo = CODIGOS_ERROR_PAGO.find((c) => error?.message.includes(c));
    if (!codigo) console.error(origen, error?.code);
    return { ok: false, codigo: codigo ?? "" };
  }
  return { ok: true, pagoId: data.pago_id, estado: data.estado, vueltoCentimos: aCentimos(data.vuelto ?? 0) };
}

export function registrarPagoEfectivo(
  cuenta: CuentaACobrar,
  montoCentimos: number,
  recibidoCentimos: number,
  clave: string,
): Promise<ResultadoPago> {
  return registrarPago("registrarPagoEfectivo", cuenta,
    { metodo: "CASH", montoCentimos, recibidoCentimos, referencia: null, aprobado: null }, clave);
}

// US-023: el pago Yape queda "Por verificar" (PENDING): no baja el saldo hasta que
// alguien autorizado confirme en el Yape del negocio que el dinero llegó.
export function registrarPagoYape(
  cuenta: CuentaACobrar,
  montoCentimos: number,
  referencia: string,
  clave: string,
): Promise<ResultadoPago> {
  return registrarPago("registrarPagoYape", cuenta,
    { metodo: "YAPE", montoCentimos, recibidoCentimos: null, referencia, aprobado: null }, clave);
}

// US-024: el cobro se hace en el POS; aquí solo se anota la referencia del voucher y
// el resultado. Aprobado → CONFIRMED (baja el saldo); rechazado → FAILED (no cobra).
export function registrarPagoTarjeta(
  cuenta: CuentaACobrar,
  montoCentimos: number,
  referencia: string,
  aprobado: boolean,
  clave: string,
): Promise<ResultadoPago> {
  return registrarPago("registrarPagoTarjeta", cuenta,
    { metodo: "CARD", montoCentimos, recibidoCentimos: null, referencia, aprobado }, clave);
}

export async function verificarPago(
  pagoId: string,
  confirmar: boolean,
): Promise<{ ok: true; estado: string } | { ok: false; codigo: string }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("verificar_pago", { p_pago_id: pagoId, p_confirmar: confirmar });
  if (error || typeof data !== "string") {
    const codigo = CODIGOS_ERROR_PAGO.find((c) => error?.message.includes(c));
    if (!codigo) console.error("verificarPago", error?.code);
    return { ok: false, codigo: codigo ?? "" };
  }
  return { ok: true, estado: data };
}
