import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { rangoLimaAUtc } from "./ventas-logica";
import { fechaHoraLima, type FilaVentaCsv } from "./ventas-csv-logica";

type Pago = {
  id: string;
  order_id: string | null;
  table_session_id: string | null;
  amount: number | string;
  confirmed_at: string;
};

const TAMANO_PAGINA = 500;

type ConsultaPaginada<T> = {
  order(columna: string, opciones: { ascending: boolean }): {
    range(desde: number, hasta: number): PromiseLike<{
      data: T[] | null;
      error: unknown;
      count: number | null;
    }>;
  };
};

async function leerTodas<T>(consultaBase: () => ConsultaPaginada<T>): Promise<T[]> {
  const filas: T[] = [];
  let inicio = 0;
  let esperado: number | null = null;

  while (true) {
    const { data, error, count } = await consultaBase()
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANO_PAGINA - 1);

    if (error || data === null || count === null) {
      throw new Error("Consulta incompleta.");
    }
    if (esperado !== null && count !== esperado) {
      throw new Error("Los pagos cambiaron durante la consulta.");
    }

    esperado = count;
    filas.push(...data);
    inicio += data.length;

    if (inicio >= esperado) return filas;
    if (data.length === 0) throw new Error("Faltan pagos por consultar.");
  }
}

export async function obtenerFilasVentasCsv(
  restauranteId: string,
  desde: string,
  hasta: string,
): Promise<FilaVentaCsv[]> {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(desde, hasta);
  if (!restauranteId.trim()) throw new Error("Restaurante no válido.");

  try {
    const supabase = await crearClienteServidor();
    // Una fila representa un pago confirmado. No se unen productos porque el esquema
    // no asigna líneas de pedido a pagos parciales.
    const pagos = await leerTodas<Pago>(() => supabase.from("payments")
      .select("id, order_id, table_session_id, amount, confirmed_at", { count: "exact" })
      .eq("restaurant_id", restauranteId)
      .eq("status", "CONFIRMED")
      .gte("confirmed_at", desdeUtc)
      .lt("confirmed_at", hastaUtcExclusivo));

    return pagos.map((pago) => {
      const esPagoMesa = pago.table_session_id !== null;
      const esPagoPedido = pago.order_id !== null;
      if (esPagoMesa === esPagoPedido) {
        throw new Error("El pago no identifica una cuenta válida.");
      }

      const importeCentimos = Math.round(Number(pago.amount) * 100);
      if (!Number.isSafeInteger(importeCentimos) || importeCentimos <= 0) {
        throw new Error("Importe de pago inválido.");
      }

      return {
        fechaHora: fechaHoraLima(pago.confirmed_at),
        pagoId: pago.id,
        cuentaId: esPagoMesa ? pago.table_session_id! : pago.order_id!,
        modalidad: esPagoMesa ? "En mesa" : "Para llevar",
        importeCentimos,
      };
    });
  } catch {
    throw new Error("No se pudieron consultar las ventas. Intenta de nuevo.");
  }
}
