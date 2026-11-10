import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const restauranteId = "10000000-0000-0000-0000-000000000001";
let cocina: SupabaseClient;

beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD para US-067.");
  cocina = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cocina.auth.signInWithPassword({ email: "cocina@demo.altoque.pe", password });
  if (error) throw new Error("No se pudo iniciar sesión con cocina demo para US-067.");
}, 30_000);

describe("RLS del stock diario", () => {
  it("permite leer al personal, pero cocina no puede agregar ni cambiar stock", async () => {
    const productos = await cocina.from("products").select("id")
      .eq("restaurant_id", restauranteId).eq("active", true).limit(1);
    expect(productos.error).toBeNull();
    expect(productos.data?.length).toBe(1);

    const lectura = await cocina.from("product_daily_stock").select("id")
      .eq("restaurant_id", restauranteId).limit(1);
    expect(lectura.error).toBeNull();

    const fecha = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const intento = await cocina.from("product_daily_stock").insert({
      restaurant_id: restauranteId,
      product_id: productos.data![0].id,
      stock_date: fecha,
      quantity: 10,
    });
    expect(intento.error).not.toBeNull();
    expect(intento.error?.code).toBe("42501");

    const intentoGuardar = await cocina.rpc("guardar_stock_diario", {
      p_restaurant_id: restauranteId,
      p_stock_date: fecha,
      p_items: [{ productoId: productos.data![0].id, cantidad: 10 }],
    });
    expect(intentoGuardar.error?.code).toBe("42501");
  }, 30_000);
});
