import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Categoria, Producto } from "./tipos";

export async function obtenerCarta(restauranteId: string): Promise<{
  categorias: Categoria[];
  productos: Producto[];
}> {
  try {
    const supabase = crearClienteAdmin();
    const [categorias, productos] = await Promise.all([
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
    ]);

    if (categorias.error || productos.error) {
      throw categorias.error ?? productos.error;
    }

    return {
      categorias: categorias.data ?? [],
      productos: (productos.data ?? []).map((producto) => ({
        ...producto,
        price: Number(producto.price),
      })),
    };
  } catch (error) {
    // Registrar únicamente el código, nunca mensajes ni datos de la consulta.
    if (error && typeof error === "object" && "code" in error) {
      if (typeof error.code === "string") console.error(error.code);
    }
    throw new Error("No se pudo cargar la carta.");
  }
}
