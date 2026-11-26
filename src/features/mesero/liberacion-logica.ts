import type { ResumenCuenta } from "../pago-cierre/cuenta-logica";

// US-106: el mesero no ve cobros. Solo sabe si puede liberar la mesa.
export type EstadoLiberacion = "LISTA" | "FALTA_PAGAR" | "POR_ENTREGAR";

export const TEXTO_LIBERACION: Record<EstadoLiberacion, string> = {
  LISTA: "Lista para liberar",
  FALTA_PAGAR: "Falta pagar en caja",
  POR_ENTREGAR: "Faltan pedidos por entregar",
};

// Misma regla que la base (impedir_cierre_con_saldo): saldo 0, sin Yape por verificar
// y sin pedidos por entregar. No devuelve montos.
export function estadoLiberacion(
  cuenta: Pick<ResumenCuenta, "saldoCentimos" | "pagosNoVerificados" | "pedidosSinEntregar">,
): EstadoLiberacion {
  const porVerificar = cuenta.pagosNoVerificados.some((pago) => pago.estado === "PENDING");
  if (cuenta.saldoCentimos > 0 || porVerificar) return "FALTA_PAGAR";
  if (cuenta.pedidosSinEntregar > 0) return "POR_ENTREGAR";
  return "LISTA";
}
