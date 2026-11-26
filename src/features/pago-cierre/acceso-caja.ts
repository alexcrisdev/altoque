import "server-only";
import { requerirPanel } from "@/features/auth/sesion";
import { puedeVerificarPagos } from "./pago-logica";

// US-106: solo caja (CASHIER) entra a las cuentas para cobrar y cerrar. El dueño y el
// admin las consultan desde /admin/cuentas. Devuelve el restaurante donde cobra.
export async function requerirCaja(): Promise<string> {
  const { restauranteId } = await requerirPanel("caja");
  return restauranteId;
}

// US-023: además del restaurante, indica si el usuario puede verificar pagos Yape.
// US-106: la excepción de cierre ya no se autoriza desde caja (pasa a /admin).
export async function contextoCaja(): Promise<{
  restauranteId: string;
  puedeVerificar: boolean;
  autorizaExcepcion: boolean;
}> {
  const { restauranteId, roles } = await requerirPanel("caja");
  return { restauranteId, puedeVerificar: puedeVerificarPagos(roles), autorizaExcepcion: false };
}
