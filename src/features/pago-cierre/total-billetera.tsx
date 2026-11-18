import { totalBilleteraAction } from "./capturas-actions";
import { centimosATexto } from "./pago-logica";
export async function TotalBilletera({ restauranteId }: { restauranteId: string }) {
  const total = await totalBilleteraAction(restauranteId).catch(() => null);
  return total === null ? <p role="status">No se pudo consultar el total de Yape/Plin de hoy.</p>
    : <p className="mt-4 font-semibold">Yape/Plin confirmado hoy: S/ {centimosATexto(total)}</p>;
}
