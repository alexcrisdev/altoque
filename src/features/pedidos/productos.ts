import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { aCentimos, type ProductoVigente } from "./validacion";

type ProductoFila = {
  id: string;
  name: string;
  price: number | string;
  active: boolean;
  available: boolean;
};

export async function obtenerProductosVigentes(
  restauranteId: string,
  ids: string[],
): Promise<ProductoVigente[]> {
  if (!ids.length) return [];

  try {
    const supabase = crearClienteAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, active, available")
      .eq("restaurant_id", restauranteId)
      .in("id", [...new Set(ids)])
      .returns<ProductoFila[]>();

    if (error) throw error;

    // Incluir inactivos y agotados para informar el motivo; otros restaurantes quedan fuera.
    return (data ?? []).map((producto) => ({
      id: producto.id,
      nombre: producto.name,
      precioCentimos: aCentimos(producto.price),
      activo: producto.active,
      disponible: producto.available,
    }));
  } catch (error) {
    // No registrar mensajes, identificadores ni datos de la consulta.
    if (error && typeof error === "object" && "code" in error) {
      if (typeof error.code === "string") console.error(error.code);
    }
    throw new Error("No se pudieron consultar los productos del pedido.");
  }
}
