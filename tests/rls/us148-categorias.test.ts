import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-148: categorías estándar contra Supabase local (migración + seed + trigger).
// El seed llama a la misma función que la migración, así que la Cevichería Demo queda
// como quedaría una base real con Ceviches, Chicharrones y Bebidas.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CEVICHERIA = "10000000-0000-0000-0000-000000000001";
const POLLERIA = "10000000-0000-0000-0000-000000000002";
const CATALOGO = [
  "Entradas", "Sopas y caldos", "Ensaladas", "Platos de fondo", "Guarniciones",
  "Postres", "Menú infantil", "Bebidas sin alcohol", "Bebidas calientes", "Bebidas con alcohol",
];

type Categoria = { id: string; name: string; sort_order: number; active: boolean };

let servicio: SupabaseClient;
let restauranteNuevo: string | null = null;

async function categorias(restaurante: string): Promise<Categoria[]> {
  const { data, error } = await servicio.from("categories").select("id, name, sort_order, active")
    .eq("restaurant_id", restaurante).order("sort_order").order("name");
  if (error) throw new Error(error.code);
  return data;
}

async function categoriaDe(restaurante: string, producto: string): Promise<string> {
  const { data, error } = await servicio.from("products").select("categoria:categories(name)")
    .eq("restaurant_id", restaurante).eq("name", producto).single<{ categoria: { name: string } }>();
  if (error) throw new Error(error.code);
  return data.categoria.name;
}

beforeAll(() => {
  if (!url || !serviceKey) throw new Error("Faltan variables de Supabase local");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Solo Supabase local");
  servicio = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  // Borra el restaurante de prueba; sus categorías se borran en cascada.
  if (restauranteNuevo) await servicio.from("restaurants").delete().eq("id", restauranteNuevo);
});

describe("US-148: categorías estándar", () => {
  it("la carta activa sigue el orden del catálogo y las antiguas quedan desactivadas, no borradas", async () => {
    const lista = await categorias(CEVICHERIA);
    expect(lista.filter((c) => c.active).map((c) => c.name)).toEqual(CATALOGO);
    expect(lista.filter((c) => c.active).map((c) => c.sort_order)).toEqual(CATALOGO.map((_, i) => i + 1));
    const antiguas = lista.filter((c) => ["Ceviches", "Chicharrones", "Bebidas"].includes(c.name));
    expect(antiguas).toHaveLength(3);
    expect(antiguas.every((c) => !c.active)).toBe(true);
  });

  it("los platos actuales pasan a su categoría nueva", async () => {
    expect(await categoriaDe(CEVICHERIA, "Ceviche clásico")).toBe("Entradas");
    expect(await categoriaDe(CEVICHERIA, "Leche de tigre")).toBe("Entradas");
    expect(await categoriaDe(CEVICHERIA, "Chicharrón de pescado")).toBe("Platos de fondo");
    expect(await categoriaDe(CEVICHERIA, "Chicha morada")).toBe("Bebidas sin alcohol");
    expect(await categoriaDe(CEVICHERIA, "Inca Kola 500 ml")).toBe("Bebidas sin alcohol");
  });

  it("otra categoría del restaurante sigue activa con sus platos, después de las 10", async () => {
    const lista = (await categorias(POLLERIA)).filter((c) => c.active);
    expect(lista.map((c) => c.name)).toEqual([...CATALOGO, "Pollos"]);
    expect(lista.at(-1)?.sort_order).toBe(11);
    expect(await categoriaDe(POLLERIA, "Pollo a la brasa")).toBe("Pollos");
  });

  it("un restaurante nuevo nace con las 10 categorías en orden", async () => {
    const sufijo = crypto.randomUUID().slice(0, 8);
    const { data, error } = await servicio.from("restaurants")
      .insert({ name: `Prueba US-148 ${sufijo}`, slug: `prueba-us148-${sufijo}` })
      .select("id").single<{ id: string }>();
    if (error) throw new Error(error.code);
    restauranteNuevo = data.id;
    const lista = await categorias(data.id);
    expect(lista.map((c) => [c.name, c.sort_order, c.active])).toEqual(CATALOGO.map((n, i) => [n, i + 1, true]));
  });
});
