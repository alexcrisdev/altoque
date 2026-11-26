import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { registrarError } from "../../lib/registro";
import { fechasHoyAyer } from "./panel-vivo-logica";
import { autorizacionValida, LARGO_MINIMO_SECRETO } from "./ventas-diarias-logica";
import {
  calcularSugerenciaPlato,
  DIAS_HISTORIA,
  MODELO_SUGERENCIA_STOCK,
  sumarDias,
  type DiaVenta,
  type MotivoIncompleto,
} from "./sugerencia-stock-logica";

type Respuesta = { estado: number; cuerpo: Record<string, unknown> };
type FilaProducto = { id: string; restaurant_id: string };
type FilaVenta = {
  restaurant_id: string;
  product_id: string;
  sales_date: string;
  units_ordered: number;
  incomplete_reason: MotivoIncompleto | null;
};
type FilaPrevia = { id: string; restaurant_id: string; product_id: string; forecast_date: string };
type Pagina<T> = { data: T[] | null; count: number | null; error: unknown };

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE = 500;

async function leerTodo<T>(consultar: (desde: number, hasta: number) => PromiseLike<Pagina<T>>): Promise<T[]> {
  const filas: T[] = [];
  let total: number | null = null;
  while (true) {
    const { data, count, error } = await consultar(filas.length, filas.length + TAMANO_PAGINA - 1);
    if (error) throw error;
    if (data === null || count === null || (total !== null && total !== count)) {
      throw new Error("Consulta incompleta");
    }
    total = count;
    filas.push(...data);
    if (filas.length >= total) return filas;
    if (!data.length) throw new Error("Consulta incompleta");
  }
}

// US-146: la llama el mismo workflow de US-145, justo después de consolidar las ventas.
// Calcula la sugerencia de hoy y de mañana de cada plato activo y la guarda en
// demand_forecasts como modelo propio. Repetirla actualiza las mismas filas (no duplica).
// Solo responde con conteos y fechas.
export async function ejecutarSugerenciaStock(
  autorizacion: string | null,
  ahora = Date.now(),
): Promise<Respuesta> {
  const secreto = process.env.VENTAS_CRON_SECRET;
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) {
    return { estado: 503, cuerpo: { error: "Sugerencia no configurada" } };
  }
  if (!autorizacionValida(autorizacion, secreto)) return { estado: 401, cuerpo: { error: "No autorizado" } };

  const { hoy, ayer } = fechasHoyAyer(ahora);
  const fechas = [hoy, sumarDias(hoy, 1)];
  try {
    const resultado = await generarSugerencias(crearClienteAdmin(), hoy, ayer, fechas, new Date(ahora).toISOString());
    return { estado: 200, cuerpo: { fechas, modelo: MODELO_SUGERENCIA_STOCK, ...resultado } };
  } catch (error) {
    registrarError("US-146: sugerencia de stock pendiente", error);
    return { estado: 500, cuerpo: { error: "Sugerencia pendiente de reintento" } };
  }
}

async function generarSugerencias(
  cliente: SupabaseClient,
  hoy: string,
  ayer: string,
  fechas: string[],
  creadoEn: string,
) {
  const [productos, ventas, previas] = await Promise.all([
    leerTodo<FilaProducto>((desde, hasta) => cliente.from("products")
      .select("id, restaurant_id", { count: "exact" }).eq("active", true)
      .order("id").range(desde, hasta)),
    // Solo días terminados: daily_product_sales nunca tiene el día de hoy.
    leerTodo<FilaVenta>((desde, hasta) => cliente.from("daily_product_sales")
      .select("restaurant_id, product_id, sales_date, units_ordered, incomplete_reason", { count: "exact" })
      .gte("sales_date", sumarDias(hoy, -DIAS_HISTORIA)).lte("sales_date", ayer)
      .order("id").range(desde, hasta)),
    leerTodo<FilaPrevia>((desde, hasta) => cliente.from("demand_forecasts")
      .select("id, restaurant_id, product_id, forecast_date", { count: "exact" })
      .eq("model", MODELO_SUGERENCIA_STOCK).in("forecast_date", fechas)
      .order("id").range(desde, hasta)),
  ]);

  const historia = new Map<string, DiaVenta[]>();
  for (const venta of ventas) {
    const clave = `${venta.restaurant_id}|${venta.product_id}`;
    const dias = historia.get(clave) ?? [];
    dias.push({ fecha: venta.sales_date, unidades: venta.units_ordered, motivo: venta.incomplete_reason });
    historia.set(clave, dias);
  }

  const filas = [];
  let platosSinDatos = 0;
  for (const producto of productos) {
    const dias = historia.get(`${producto.restaurant_id}|${producto.id}`) ?? [];
    for (const fecha of fechas) {
      const sugerencia = calcularSugerenciaPlato(dias, fecha, hoy);
      if (!sugerencia) {
        platosSinDatos++;
        continue;
      }
      filas.push({
        restaurant_id: producto.restaurant_id, product_id: producto.id, forecast_date: fecha,
        predicted_quantity: sugerencia.cantidad, model: MODELO_SUGERENCIA_STOCK, created_at: creadoEn,
      });
    }
  }

  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const { error } = await cliente.from("demand_forecasts")
      .upsert(filas.slice(i, i + TAMANO_LOTE), { onConflict: "restaurant_id,product_id,forecast_date,model" });
    if (error) throw error;
  }

  // Una sugerencia propia que ya no tiene datos suficientes (o de un plato desactivado)
  // se borra: así ese plato vuelve a la demo, si existe.
  const vigentes = new Set(filas.map(fila => `${fila.restaurant_id}|${fila.product_id}|${fila.forecast_date}`));
  const obsoletas = previas
    .filter(fila => !vigentes.has(`${fila.restaurant_id}|${fila.product_id}|${fila.forecast_date}`))
    .map(fila => fila.id);
  for (let i = 0; i < obsoletas.length; i += TAMANO_LOTE) {
    const { error } = await cliente.from("demand_forecasts")
      .delete().eq("model", MODELO_SUGERENCIA_STOCK).in("id", obsoletas.slice(i, i + TAMANO_LOTE));
    if (error) throw error;
  }

  return { sugerencias: filas.length, sinDatosSuficientes: platosSinDatos, eliminadas: obsoletas.length };
}
