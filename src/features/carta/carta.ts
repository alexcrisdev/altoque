import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { fechaActualLima } from "./validar-stock";
import type { Categoria, DisponibilidadProducto, Producto } from "./tipos";

type FilaStock = { product_id: string; quantity: number; sold: number };

// US-103: une la marca "available" del producto con el stock del día.
// Sin fila de stock no hay límite (quedan = null).
export function calcularDisponibilidad(
  available: boolean,
  stock: FilaStock | undefined,
): { available: boolean; quedan: number | null } {
  if (!stock) return { available, quedan: null };
  const quedan = Math.max(0, stock.quantity - stock.sold);
  return { available: available && quedan > 0, quedan };
}

function registrarCodigo(error: unknown) {
  // Registrar únicamente el código, nunca mensajes ni datos de la consulta.
  if (error && typeof error === "object" && "code" in error) {
    if (typeof error.code === "string") console.error(error.code);
  }
}

function consultarStockDeHoy(restauranteId: string) {
  return crearClienteAdmin()
    .from("product_daily_stock")
    .select("product_id, quantity, sold")
    .eq("restaurant_id", restauranteId)
    .eq("stock_date", fechaActualLima());
}

export async function obtenerCarta(restauranteId: string): Promise<{
  categorias: Categoria[];
  productos: Producto[];
}> {
  try {
    const supabase = crearClienteAdmin();
    const [categorias, productos, existencias] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("restaurant_id", restauranteId)
        .eq("active", true)
        .order("sort_order")
        .order("name")
        .returns<Categoria[]>(),
      supabase
        .from("products")
        .select("id, category_id, name, description, price, image_url, available, ingredients, allergens")
        .eq("restaurant_id", restauranteId)
        .eq("active", true)
        .order("name")
        .returns<Producto[]>(),
      consultarStockDeHoy(restauranteId),
    ]);

    if (categorias.error || productos.error || existencias.error) {
      throw categorias.error ?? productos.error ?? existencias.error;
    }

    const stockPorProducto = new Map(
      ((existencias.data ?? []) as FilaStock[]).map((fila) => [fila.product_id, fila]),
    );
    return {
      categorias: categorias.data ?? [],
      productos: (productos.data ?? []).map((producto) => {
        const { available, quedan } = calcularDisponibilidad(
          producto.available,
          stockPorProducto.get(producto.id),
        );
        return {
          ...producto,
          price: Number(producto.price),
          available,
          // Solo se agrega cuando hay límite, para no cambiar la forma de siempre.
          ...(quedan === null ? {} : { quedan }),
        };
      }),
    };
  } catch (error) {
    registrarCodigo(error);
    throw new Error("No se pudo cargar la carta.");
  }
}

// US-103: consulta liviana que la carta repite cada pocos segundos.
// Devuelve solo id, disponibilidad y unidades: nada que la carta no muestre ya.
// Un producto desactivado vuelve como agotado para bloquear su línea del carrito.
export async function obtenerDisponibilidad(
  restauranteId: string,
): Promise<DisponibilidadProducto[]> {
  try {
    const supabase = crearClienteAdmin();
    const [productos, existencias] = await Promise.all([
      supabase
        .from("products")
        .select("id, available, active")
        .eq("restaurant_id", restauranteId)
        .returns<{ id: string; available: boolean; active: boolean }[]>(),
      consultarStockDeHoy(restauranteId),
    ]);

    if (productos.error || existencias.error) {
      throw productos.error ?? existencias.error;
    }

    const stockPorProducto = new Map(
      ((existencias.data ?? []) as FilaStock[]).map((fila) => [fila.product_id, fila]),
    );
    return (productos.data ?? []).map((producto) => ({
      id: producto.id,
      ...calcularDisponibilidad(
        producto.active && producto.available,
        stockPorProducto.get(producto.id),
      ),
    }));
  } catch (error) {
    registrarCodigo(error);
    throw new Error("No se pudo consultar el stock.");
  }
}
