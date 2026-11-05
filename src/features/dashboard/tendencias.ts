import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { rangoLimaAUtc } from "./ventas-logica";
import {
  calcularProductosMasVendidos,
  contarPedidosPorEstado,
  type ConteoPedidos,
  type PedidoTendencia,
  type ProductoMasVendido,
} from "./tendencias-logica";

export type ResumenTendencias = ConteoPedidos & {
  productos: ProductoMasVendido[];
};

const TAMANO_PAGINA = 500;

export async function obtenerTendencias(
  restauranteId: string,
  desde: string,
  hasta: string,
): Promise<ResumenTendencias> {
  // Un rango inválido no llega a consultar la base.
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(
    desde,
    hasta,
  );

  if (!restauranteId.trim()) {
    throw new Error("No se pudo identificar el restaurante.");
  }

  try {
    const supabase = await crearClienteServidor();

    const pedidos: PedidoTendencia[] = [];
    let inicio = 0;
    let totalEsperado: number | null = null;

    while (true) {
      const { data, error, count } = await supabase
        .from("orders")
        .select(
          "id, status, created_at, order_items(product_id, product_name, quantity)",
          { count: "exact" },
        )
        .eq("restaurant_id", restauranteId)
        .gte("created_at", desdeUtc)
        .lt("created_at", hastaUtcExclusivo)
        .order("id", { ascending: true })
        .range(inicio, inicio + TAMANO_PAGINA - 1)
        .overrideTypes<PedidoTendencia[], { merge: false }>();

      if (error) {
        console.error("obtenerTendencias", error.code);
        throw new Error("Consulta fallida.");
      }

      if (data === null || count === null) {
        throw new Error("Consulta incompleta.");
      }

      if (totalEsperado !== null && count !== totalEsperado) {
        throw new Error("Los pedidos cambiaron durante la consulta.");
      }

      totalEsperado = count;
      pedidos.push(...data);
      inicio += data.length;

      if (inicio >= totalEsperado) break;

      if (data.length === 0) {
        throw new Error("Faltan pedidos por consultar.");
      }
    }

    // Incluimos cancelados en la consulta porque cuentan por estado.
    // La lógica del top los excluye únicamente de las unidades.
    const productos = calcularProductosMasVendidos(pedidos);
    const { porEstado, total } = contarPedidosPorEstado(pedidos);

    return { productos, porEstado, total };
  } catch {
    throw new Error(
      "No se pudieron consultar las tendencias. Intenta de nuevo.",
    );
  }
}
