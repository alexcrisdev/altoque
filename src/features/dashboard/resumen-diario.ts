import "server-only";

import { crearClienteAdmin } from "../../lib/supabase/admin";
import { cuentaDePrueba, esPedidoDePrueba, obtenerIdsPedidosDePrueba, obtenerSesionesSoloDePrueba } from "./pedidos-de-prueba";
import { rangoLimaAUtc } from "./ventas-logica";
import type { PedidoTendencia } from "./tendencias-logica";
import {
  calcularResumenDiario,
  fechaSiguienteResumen,
  type PagoResumenDiario,
  type CierreResumenDiario,
  type ResumenDiario,
} from "./resumen-diario-logica";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TAMANO_PAGINA = 500;

type FilaRestaurante = {
  id: string;
  restaurant_id: string;
};

type FilaCierre = CierreResumenDiario & FilaRestaurante & {
  order_id: string | null;
  table_session_id: string | null;
};

type RespuestaPagina<T> = {
  data: T[] | null;
  count: number | null;
  error: { code?: string } | null;
};

type FilaPrediccion = FilaRestaurante & {
  product_id: string;
  forecast_date: string;
  predicted_quantity: number;
  model: string;
  created_at: string;
  producto: { name: string } | null;
};

export class RestauranteResumenNoEncontrado extends Error {}

class ConsultaResumenError extends Error {
  constructor(readonly codigo: string | undefined) {
    super("No se pudo consultar el resumen diario.");
  }
}

async function leerPaginas<T extends FilaRestaurante>(
  restauranteId: string,
  consultar: (
    inicio: number,
  ) => PromiseLike<RespuestaPagina<T>>,
): Promise<T[]> {
  const filas: T[] = [];
  const ids = new Set<string>();
  let totalEsperado: number | null = null;

  while (true) {
    const { data, count, error } = await consultar(filas.length);

    if (error) {
      throw new ConsultaResumenError(error.code);
    }

    if (
      data === null ||
      count === null ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      (
        totalEsperado !== null &&
        count !== totalEsperado
      )
    ) {
      throw new Error(
        "La consulta está incompleta o cambió durante la lectura.",
      );
    }

    totalEsperado = count;

    for (const fila of data) {
      if (
        !fila.id?.trim() ||
        ids.has(fila.id) ||
        fila.restaurant_id !== restauranteId
      ) {
        throw new Error(
          "La consulta devolvió registros inconsistentes.",
        );
      }

      ids.add(fila.id);
      filas.push(fila);
    }

    if (filas.length > count) {
      throw new Error(
        "La consulta devolvió más registros de los esperados.",
      );
    }

    if (filas.length === count) return filas;

    if (!data.length) {
      throw new Error("Faltan registros por consultar.");
    }
  }
}

export async function obtenerResumenDiario(
  restauranteId: string,
  fecha: string,
): Promise<ResumenDiario> {
  if (!UUID.test(restauranteId)) {
    throw new Error("El restaurante no es válido.");
  }

  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(
    fecha,
    fecha,
  );

  const manana = fechaSiguienteResumen(fecha);
  const cliente = crearClienteAdmin();

  const restaurante = await cliente
    .from("restaurants")
    .select("id, name")
    .eq("id", restauranteId)
    .maybeSingle<{ id: string; name: string }>();

  if (restaurante.error) {
    throw new ConsultaResumenError(restaurante.error.code);
  }

  if (!restaurante.data) {
    throw new RestauranteResumenNoEncontrado(
      "El restaurante no existe.",
    );
  }

  if (
    restaurante.data.id !== restauranteId ||
    !restaurante.data.name?.trim()
  ) {
    throw new Error("No se pudo identificar el restaurante.");
  }

  const pagos = await leerPaginas<
    PagoResumenDiario & FilaRestaurante
  >(restauranteId, inicio =>
    cliente
      .from("payments")
      .select(
        "id, restaurant_id, table_session_id, order_id, method, status, amount, confirmed_at, stripe_session_id",
        { count: "exact" },
      )
      .eq("restaurant_id", restauranteId)
      .eq("status", "CONFIRMED")
      .gte("confirmed_at", desdeUtc)
      .lt("confirmed_at", hastaUtcExclusivo)
      .order("id")
      .range(inicio, inicio + TAMANO_PAGINA - 1)
      .overrideTypes<
        (PagoResumenDiario & FilaRestaurante)[],
        { merge: false }
      >(),
  );

  const pedidos = await leerPaginas<
    PedidoTendencia & FilaRestaurante
  >(restauranteId, inicio =>
    cliente
      .from("orders")
      .select(
        "id, restaurant_id, status, created_at, order_items(product_id, product_name, quantity)",
        { count: "exact" },
      )
      .eq("restaurant_id", restauranteId)
      .neq("status", "CANCELLED")
      .gte("created_at", desdeUtc)
      .lt("created_at", hastaUtcExclusivo)
      .order("id")
      .range(inicio, inicio + TAMANO_PAGINA - 1)
      .overrideTypes<
        (PedidoTendencia & FilaRestaurante)[],
        { merge: false }
      >(),
  );

  const cierres = await leerPaginas<FilaCierre>(restauranteId, inicio =>
    cliente
      .from("account_closures")
      .select(
        "id, restaurant_id, kind, reason, closed_at, order_id, table_session_id",
        { count: "exact" },
      )
      .eq("restaurant_id", restauranteId)
      .eq("kind", "EXCEPTION")
      .gte("closed_at", desdeUtc)
      .lt("closed_at", hastaUtcExclusivo)
      .order("id")
      .range(inicio, inicio + TAMANO_PAGINA - 1)
      .overrideTypes<
        FilaCierre[],
        { merge: false }
      >(),
  );

  let predicciones: FilaPrediccion[];

  try {
    predicciones = await leerPaginas<FilaPrediccion>(
      restauranteId,
      inicio =>
        cliente
          .from("demand_forecasts")
          .select(
            "id, restaurant_id, product_id, forecast_date, predicted_quantity, model, created_at, producto:products!demand_forecasts_product_restaurant_fkey(name)",
            { count: "exact" },
          )
          .eq("restaurant_id", restauranteId)
          .eq("forecast_date", manana)
          .order("id")
          .range(inicio, inicio + TAMANO_PAGINA - 1)
          .overrideTypes<
            FilaPrediccion[],
            { merge: false }
          >(),
    );
  } catch (error) {
    // Si US-090 todavía no está aplicada, se omite la predicción.
    // Los errores de permisos, red u otros errores no se ocultan.
    if (
      !(error instanceof ConsultaResumenError) ||
      !["42P01", "PGRST205"].includes(error.codigo ?? "")
    ) {
      throw error;
    }

    predicciones = [];
    console.warn(
      "US-089: tabla de predicciones aún no disponible.",
    );
  }

  const idsDePrueba = await obtenerIdsPedidosDePrueba(cliente, restauranteId);
  const sesiones = [...pagos, ...cierres].flatMap((cuenta) =>
    cuenta.table_session_id ? [cuenta.table_session_id] : []);
  const sesionesDePrueba = await obtenerSesionesSoloDePrueba(cliente, restauranteId, sesiones, idsDePrueba);

  return calcularResumenDiario({
    restaurante: {
      id: restaurante.data.id,
      nombre: restaurante.data.name,
    },
    fecha,
    pagos: pagos.filter((pago) => !cuentaDePrueba(pago, idsDePrueba, sesionesDePrueba)),
    pedidos: pedidos.filter((pedido) => !esPedidoDePrueba(pedido.id, idsDePrueba)),
    cierres: cierres.filter((cierre) => !cuentaDePrueba(cierre, idsDePrueba, sesionesDePrueba)),
    predicciones: predicciones.map(fila => {
      if (
        !fila.producto ||
        fila.forecast_date !== manana
      ) {
        throw new Error("La predicción está incompleta.");
      }

      return {
        productoId: fila.product_id,
        nombre: fila.producto.name,
        fecha: fila.forecast_date,
        cantidadPrevista: fila.predicted_quantity,
        modelo: fila.model,
        creadoEn: fila.created_at,
      };
    }),
  });
}
