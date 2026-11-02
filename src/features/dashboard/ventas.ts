import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
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

    return calcularResumenVentas(pagos);
  } catch {
    // No exponemos mensajes internos ni datos de pagos.
    throw new Error(
      "No se pudieron consultar las ventas. Intenta de nuevo.",
    );
  }
}
