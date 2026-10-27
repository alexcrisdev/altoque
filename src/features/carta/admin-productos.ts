import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ProductoValidado } from "./validar-producto";

export type CategoriaAdmin = { id: string; name: string; active: boolean };
export type ProductoAdmin = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  available: boolean;
  active: boolean;
  ingredients: string | null;
  allergens: string[];
};

export type ResultadoCambioProducto = "OK" | "DUPLICADO" | "ERROR" | "NO_ENCONTRADO";

type FilaProducto = Omit<ProductoAdmin, "price"> & { price: number | string };

function registrarCodigo(error: { code?: string }): void {
  if (error.code) console.error(error.code);
}

export async function listarProductosAdmin(restauranteId: string): Promise<ProductoAdmin[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("products")
    .select("id, category_id, name, description, price, image_url, available, active, ingredients, allergens")
    .eq("restaurant_id", restauranteId)
    .order("name")
    .returns<FilaProducto[]>();

  if (error) {
    registrarCodigo(error);
    throw new Error("No se pudieron cargar los productos.");
  }

  return data.map((producto) => ({ ...producto, price: Number(producto.price) }));
}

export async function listarCategorias(restauranteId: string): Promise<CategoriaAdmin[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, active")
    .eq("restaurant_id", restauranteId)
    .order("sort_order")
    .order("name");

  if (error) {
    registrarCodigo(error);
    throw new Error("No se pudieron cargar las categorías.");
  }
  return data;
}

function datosDeProducto(restauranteId: string, producto: ProductoValidado) {
  return {
    restaurant_id: restauranteId,
    category_id: producto.categoryId,
    name: producto.name,
    description: producto.description,
    price: producto.price,
    image_url: producto.imageUrl,
    ingredients: producto.ingredients,
    allergens: producto.allergens,
  };
}

export async function crearProducto(
  restauranteId: string,
  producto: ProductoValidado,
): Promise<ResultadoCambioProducto> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("products").insert({
    ...datosDeProducto(restauranteId, producto),
    available: true,
    active: true,
  });
  if (!error) return "OK";
  if (error.code === "23505") return "DUPLICADO";
  registrarCodigo(error);
  return "ERROR";
}

export async function editarProducto(
  restauranteId: string,
  productoId: string,
  producto: ProductoValidado,
): Promise<ResultadoCambioProducto> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("products")
    .update(datosDeProducto(restauranteId, producto))
    .eq("id", productoId)
    .eq("restaurant_id", restauranteId)
    .select("id");
  if (!error) return data.length ? "OK" : "NO_ENCONTRADO";
  if (error.code === "23505") return "DUPLICADO";
  registrarCodigo(error);
  return "ERROR";
}

async function cambiarCampoProducto(
  restauranteId: string,
  productoId: string,
  campo: "available" | "active",
  valor: boolean,
): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("products")
    .update({ [campo]: valor })
    .eq("id", productoId)
    .eq("restaurant_id", restauranteId)
    .select("id");
  if (error) {
    registrarCodigo(error);
    return false;
  }
  return data.length === 1;
}

export function cambiarDisponibilidad(
  restauranteId: string,
  productoId: string,
  disponible: boolean,
): Promise<boolean> {
  return cambiarCampoProducto(restauranteId, productoId, "available", disponible);
}

export function cambiarActivo(
  restauranteId: string,
  productoId: string,
  activo: boolean,
): Promise<boolean> {
  return cambiarCampoProducto(restauranteId, productoId, "active", activo);
}
