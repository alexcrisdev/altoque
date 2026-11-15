import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import {
  compararStockConPrediccion, fechaMananaLima, nombreDiaPrediccion,
  topPlatosPrevistos, type ComparacionStock, type PrediccionPlato,
} from "./prediccion-logica";

export type PlatoPrevistoConStock = Pick<PrediccionPlato, "productoId" | "nombre"> & ComparacionStock;
export type ResumenPrediccion = {
  fecha: string;
  dia: string;
  modelo: string | null;
  esDemo: boolean;
  platos: PlatoPrevistoConStock[];
};

type FilaPrediccion = {
  id: string;
  product_id: string;
  forecast_date: string;
  predicted_quantity: number;
  model: string;
  created_at: string;
  producto: { name: string } | null;
};

type FilaStock = { product_id: string; quantity: number };
const COLUMNAS = "id, product_id, forecast_date, predicted_quantity, model, created_at, producto:products!demand_forecasts_product_restaurant_fkey(name)";

export async function obtenerPrediccionManana(
  restauranteId: string,
  ahora: Date = new Date(),
): Promise<ResumenPrediccion> {
  if (typeof restauranteId !== "string" || !restauranteId.trim()) {
    throw new Error("No se pudo identificar el restaurante.");
  }
  const fecha = fechaMananaLima(ahora);
  const supabase = await crearClienteServidor();
  const filas: FilaPrediccion[] = [];
  const ids = new Set<string>();
  let inicio = 0;
  let totalEsperado: number | null = null;

  while (true) {
    const { data, error, count } = await supabase.from("demand_forecasts")
      .select(COLUMNAS, { count: "exact" })
      .eq("restaurant_id", restauranteId).eq("forecast_date", fecha)
      .order("id", { ascending: true }).range(inicio, inicio + 499)
      .overrideTypes<FilaPrediccion[], { merge: false }>();
    if (error) {
      console.error("obtenerPrediccionManana", error.code);
      throw new Error("No se pudieron consultar las predicciones.");
    }
    if (data === null || count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("La consulta de predicciones está incompleta.");
    }
    if (totalEsperado !== null && totalEsperado !== count) {
      throw new Error("Las predicciones cambiaron durante la consulta. Intenta de nuevo.");
    }
    totalEsperado = count;
    for (const fila of data) {
      if (!fila.id?.trim() || ids.has(fila.id) || fila.forecast_date !== fecha || !fila.producto) {
        throw new Error("La consulta devolvió predicciones inconsistentes.");
      }
      ids.add(fila.id);
      filas.push(fila);
    }
    inicio += data.length;
    if (inicio === count) break;
    if (inicio > count || data.length === 0) throw new Error("Faltan predicciones por consultar.");
  }

  const top = topPlatosPrevistos(filas.map(fila => ({
    productoId: fila.product_id, nombre: fila.producto!.name, fecha: fila.forecast_date,
    cantidadPrevista: fila.predicted_quantity, modelo: fila.model, creadoEn: fila.created_at,
  })), fecha);
  const modelo = top[0]?.modelo ?? null;
  const resumen: ResumenPrediccion = {
    fecha, dia: nombreDiaPrediccion(fecha), modelo,
    esDemo: modelo?.endsWith("-demo") ?? false, platos: [],
  };
  if (top.length === 0) return resumen;

  const productos = top.map(fila => fila.productoId);
  const { data: stock, error: errorStock } = await supabase.from("product_daily_stock")
    .select("product_id, quantity").eq("restaurant_id", restauranteId)
    .eq("stock_date", fecha).in("product_id", productos)
    .overrideTypes<FilaStock[], { merge: false }>();
  if (errorStock) {
    console.error("obtenerPrediccionManana:stock", errorStock.code);
    throw new Error("No se pudo consultar el stock de la fecha prevista.");
  }
  if (stock === null) throw new Error("La consulta de stock está incompleta.");
  const porProducto = new Map<string, number>();
  for (const fila of stock) {
    if (!productos.includes(fila.product_id) || porProducto.has(fila.product_id) || typeof fila.quantity !== "number") {
      throw new Error("La consulta devolvió stock inconsistente.");
    }
    porProducto.set(fila.product_id, fila.quantity);
  }
  resumen.platos = top.map(fila => ({
    productoId: fila.productoId, nombre: fila.nombre,
    ...compararStockConPrediccion(porProducto.get(fila.productoId), fila.cantidadPrevista),
  }));
  return resumen;
}
