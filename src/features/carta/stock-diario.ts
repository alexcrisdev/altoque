import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { CantidadStock } from "./validar-stock";

export type ProductoConStock = {
  id: string;
  name: string;
  cantidad: number | null;
  vendidos: number;
};

export async function listarProductosConStock(
  restauranteId: string,
  fecha: string,
): Promise<ProductoConStock[]> {
  const supabase = await crearClienteServidor();
  const [productos, existencias] = await Promise.all([
    supabase.from("products").select("id, name").eq("restaurant_id", restauranteId).eq("active", true).order("name"),
    supabase.from("product_daily_stock").select("product_id, quantity, sold")
      .eq("restaurant_id", restauranteId).eq("stock_date", fecha),
  ]);

  if (productos.error || existencias.error) {
    const error = productos.error ?? existencias.error;
    if (error?.code) console.error(error.code);
    throw new Error("No se pudo cargar el stock de hoy.");
  }
  const porProducto = new Map((existencias.data ?? []).map((fila) => [fila.product_id, fila]));
  return (productos.data ?? []).map((producto) => {
    const fila = porProducto.get(producto.id);
    return {
      id: producto.id,
      name: producto.name,
      cantidad: fila?.quantity ?? null,
      vendidos: fila?.sold ?? 0,
    };
  });
}

export async function guardarStockDiario(
  restauranteId: string,
  fecha: string,
  items: CantidadStock[],
): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_stock_diario", {
    p_restaurant_id: restauranteId,
    p_stock_date: fecha,
    p_items: items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })),
  });
  if (!error) return null;
  if (error.code) console.error(error.code);
  if (error.message.includes("STOCK_BELOW_SOLD")) return "La cantidad no puede ser menor a los platos ya vendidos hoy.";
  if (error.message.includes("STOCK_ALREADY_SOLD")) return "No puedes quitar el límite después de registrar ventas de hoy.";
  if (error.message.includes("INVALID_PRODUCT")) return "La lista de productos cambió. Recarga la página e intenta de nuevo.";
  return "No se pudo guardar el stock. Recarga la página e intenta de nuevo.";
}
