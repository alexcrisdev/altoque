import "server-only";
import { obtenerProductosVigentes } from "./productos";
import {
  validarEstructura,
  validarItems,
  type ResultadoValidacionItems,
} from "./validacion";

export type ResultadoValidacionPedido =
  | ResultadoValidacionItems
  | { ok: false; problemas: []; motivo: "DATOS_INVALIDOS" };

// restauranteId debe provenir de resolverAccesoQr en el servidor, nunca del navegador.
// US-009 debe llamar a esta función antes de guardar; si ok es false, no se crea ningún pedido.
export async function validarPedido(
  restauranteId: string,
  entrada: unknown,
): Promise<ResultadoValidacionPedido> {
  const items = validarEstructura(entrada);
  if (!items) {
    return { ok: false, problemas: [], motivo: "DATOS_INVALIDOS" };
  }

  const productos = await obtenerProductosVigentes(
    restauranteId,
    items.map((item) => item.productoId),
  );
  return validarItems(items, productos);
}
