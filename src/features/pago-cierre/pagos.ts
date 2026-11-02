import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { aCentimos } from "../pedidos/validacion";
import { CODIGOS_ERROR_PAGO, centimosATexto, type CuentaACobrar } from "./pago-logica";

// US-022: capa de datos del cobro. Usa la sesión del usuario: la función
// registrar_pago vuelve a revisar rol, restaurante, saldo y montos.

export type ResultadoPago =
  | { ok: true; pagoId: string; vueltoCentimos: number }
  | { ok: false; codigo: string };

export async function registrarPagoEfectivo(
  cuenta: CuentaACobrar,
  montoCentimos: number,
  recibidoCentimos: number,
  clave: string,
): Promise<ResultadoPago> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("registrar_pago", {
      p_sesion_id: cuenta.tipo === "MESA" ? cuenta.id : null,
      p_pedido_id: cuenta.tipo === "PARA_LLEVAR" ? cuenta.id : null,
      p_metodo: "CASH",
      p_monto: centimosATexto(montoCentimos),
      p_recibido: centimosATexto(recibidoCentimos),
      p_referencia: null,
      p_aprobado: null,
      p_clave: clave,
    })
    .single()
    .overrideTypes<{ pago_id: string; estado: string; vuelto: number | string | null }, { merge: false }>();

  if (error || !data) {
    const codigo = CODIGOS_ERROR_PAGO.find((c) => error?.message.includes(c));
    if (!codigo) console.error("registrarPagoEfectivo", error?.code);
    return { ok: false, codigo: codigo ?? "" };
  }
  return { ok: true, pagoId: data.pago_id, vueltoCentimos: aCentimos(data.vuelto ?? 0) };
}
