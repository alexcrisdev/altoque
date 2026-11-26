import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { aCentimos } from "../pedidos/validacion";
import { filtrarCuentasReales, obtenerIdsPedidosDePrueba } from "./pedidos-de-prueba";
import {
  calcularResumenVentas,
  rangoLimaAUtc,
  type PagoVenta,
  type ResumenVentas,
} from "./ventas-logica";

const TAMANO_PAGINA = 500;

export async function obtenerResumenVentas(
  restauranteId: string,
  desde: string,
  hasta: string,
): Promise<ResumenVentas> {
  // Validamos antes de crear el cliente o consultar la base.
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(
    desde,
    hasta,
  );

  if (!restauranteId.trim()) {
    throw new Error("No se pudo identificar el restaurante.");
  }

  try {
    // Usa la sesión del usuario: no utiliza service role.
    const supabase = await crearClienteServidor();

    const pagos: PagoVenta[] = [];
    let inicio = 0;
    let totalEsperado: number | null = null;

    while (true) {
      const { data, error, count } = await supabase
        .from("payments")
        .select(
          "table_session_id, order_id, method, status, amount",
          { count: "exact" },
        )
        .eq("restaurant_id", restauranteId)
        .eq("status", "CONFIRMED")
        .gte("confirmed_at", desdeUtc)
        .lt("confirmed_at", hastaUtcExclusivo)
        .order("id", { ascending: true })
        .range(inicio, inicio + TAMANO_PAGINA - 1)
        .overrideTypes<PagoVenta[], { merge: false }>();

      if (error) {
        console.error("obtenerResumenVentas", error.code);
        throw new Error("Consulta fallida.");
      }

      if (data === null || count === null) {
        throw new Error("Consulta incompleta.");
      }

      // Si cambia la cantidad entre páginas, evitamos devolver
      // un reporte mezclado y pedimos repetir la consulta.
      if (totalEsperado !== null && count !== totalEsperado) {
        throw new Error("Los pagos cambiaron durante la consulta.");
      }

      totalEsperado = count;
      pagos.push(...data);
      inicio += data.length;

      if (inicio >= totalEsperado) break;

      // No presentamos un total parcial como si fuera completo.
      if (data.length === 0) {
        throw new Error("Faltan pagos por consultar.");
      }
    }

    const idsDePrueba = await obtenerIdsPedidosDePrueba(supabase, restauranteId);
    const resumen = calcularResumenVentas(await filtrarCuentasReales(supabase, restauranteId, pagos, idsDePrueba));
    // US-105: un pedido pagado, cancelado y devuelto deja de contar como venta.
    return restarDevoluciones(resumen, await sumarDevolucionesRealizadas(supabase, restauranteId, desdeUtc, hastaUtcExclusivo));
  } catch {
    // No exponemos mensajes internos ni datos de pagos.
    throw new Error(
      "No se pudieron consultar las ventas. Intenta de nuevo.",
    );
  }
}

// US-105: suma las devoluciones marcadas como hechas (estado REFUNDED) en el periodo,
// según la fecha en que se devolvió el dinero.
async function sumarDevolucionesRealizadas(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  restauranteId: string,
  desdeUtc: string,
  hastaUtcExclusivo: string,
): Promise<number> {
  const TAMANO = 500;
  let total = 0;
  for (let desde = 0; ; desde += TAMANO) {
    const { data, error } = await supabase
      .from("order_refunds")
      .select("id, amount")
      .eq("restaurant_id", restauranteId)
      .eq("status", "REFUNDED")
      .gte("refunded_at", desdeUtc)
      .lt("refunded_at", hastaUtcExclusivo)
      .order("id", { ascending: true })
      .range(desde, desde + TAMANO - 1)
      .overrideTypes<{ id: string; amount: number | string }[], { merge: false }>();
    if (error || data === null) {
      console.error("sumarDevolucionesRealizadas", error?.code);
      throw new Error("Consulta de devoluciones fallida.");
    }
    total += data.reduce((suma, fila) => suma + aCentimos(fila.amount), 0);
    if (data.length < TAMANO) return total;
  }
}

// Resta lo devuelto de las ventas y recalcula el ticket promedio. El desglose por método
// sigue mostrando lo cobrado (una devolución no tiene método de pago).
export function restarDevoluciones(resumen: ResumenVentas, devueltoCentimos: number): ResumenVentas {
  if (!Number.isSafeInteger(devueltoCentimos) || devueltoCentimos <= 0) return resumen;
  const ventasCentimos = Math.max(0, resumen.ventasCentimos - devueltoCentimos);
  return {
    ...resumen,
    ventasCentimos,
    ticketPromedioCentimos: resumen.cuentasPagadas === 0 ? 0 : Math.round(ventasCentimos / resumen.cuentasPagadas),
  };
}
