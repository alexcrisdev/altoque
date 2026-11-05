import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { aCentimos } from "../pedidos/validacion";
import { CODIGOS_ERROR_CIERRE, type CierreCuenta, type TipoCierre } from "./cierre-logica";
import type { CuentaACobrar } from "./pago-logica";

// US-020: capa de datos del cierre. Usa la sesión del usuario: cerrar_cuenta
// vuelve a revisar rol, restaurante, saldo, pagos por verificar y motivo.

export type FilaCierre = {
  table_session_id: string | null;
  order_id: string | null;
  kind: TipoCierre;
  consumption: number | string;
  paid: number | string;
  balance: number | string;
  reason: string | null;
  closed_at: string;
  cerrador: { full_name: string } | null;
};

export const COLUMNAS_CIERRE =
  "table_session_id, order_id, kind, consumption, paid, balance, reason, closed_at, cerrador:users!account_closures_closed_by_fkey(full_name)";

export function aCierreCuenta(fila: FilaCierre): CierreCuenta {
  return {
    tipo: fila.kind,
    consumoCentimos: aCentimos(fila.consumption),
    pagadoCentimos: aCentimos(fila.paid),
    saldoCentimos: aCentimos(fila.balance),
    motivo: fila.reason,
    cerradoPor: fila.cerrador?.full_name ?? null,
    cerradoEn: fila.closed_at,
  };
}

export async function cerrarCuenta(
  cuenta: CuentaACobrar,
  motivo: string | null,
): Promise<{ ok: true; tipo: TipoCierre } | { ok: false; codigo: string }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("cerrar_cuenta", {
      p_sesion_id: cuenta.tipo === "MESA" ? cuenta.id : null,
      p_pedido_id: cuenta.tipo === "PARA_LLEVAR" ? cuenta.id : null,
      p_motivo: motivo,
    })
    .single()
    .overrideTypes<{ cierre_id: string; tipo: TipoCierre }, { merge: false }>();

  if (error || !data) {
    const codigo = CODIGOS_ERROR_CIERRE.find((c) => error?.message.includes(c));
    if (!codigo) console.error("cerrarCuenta", error?.code);
    return { ok: false, codigo: codigo ?? "" };
  }
  return { ok: true, tipo: data.tipo };
}
