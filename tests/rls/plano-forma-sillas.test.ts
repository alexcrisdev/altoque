import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Plano: forma y sillas de la mesa contra Supabase local (migración, límites y permisos).
// Usa una mesa propia con número al azar y la borra al terminar. No crea ni toca QR.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const RESTAURANTE = "10000000-0000-0000-0000-000000000001";
const LOCAL = "20000000-0000-0000-0000-000000000001";
const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

let servicio: SupabaseClient;
let mesaId: string | null = null;

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, opciones);
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  return cliente;
}

async function leerMesa() {
  const { data, error } = await servicio.from("dining_tables").select("shape, capacity").eq("id", mesaId!).single();
  if (error) throw new Error(error.code);
  return data;
}

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey || !password) throw new Error("Faltan variables de Supabase local");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Solo Supabase local");
  servicio = createClient(url, serviceKey, opciones);
  // Número al azar; si ya existe en el local (23505), prueba con otro.
  for (let intento = 0; intento < 5 && !mesaId; intento++) {
    const numero = 500 + Math.floor(Math.random() * 499);
    const { data, error } = await servicio.from("dining_tables")
      .insert({ restaurant_id: RESTAURANTE, branch_id: LOCAL, number: numero, shape: "SQUARE", capacity: 6 })
      .select("id").single<{ id: string }>();
    if (error && error.code !== "23505") throw new Error(error.code);
    if (data) mesaId = data.id;
  }
  if (!mesaId) throw new Error("No se pudo crear la mesa de prueba");
});

afterAll(async () => {
  if (mesaId) await servicio.from("dining_tables").delete().eq("id", mesaId);
});

describe("Plano: forma y sillas en la base", () => {
  it("la migración deja las mesas que ya existían como redondas", async () => {
    const { data, error } = await servicio.from("dining_tables").select("shape")
      .in("restaurant_id", [RESTAURANTE, "10000000-0000-0000-0000-000000000002"]).neq("id", mesaId!);
    if (error) throw new Error(error.code);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((m) => m.shape === "ROUND")).toBe(true);
  });

  it("rechaza 9 sillas, 0 sillas y una forma inválida", async () => {
    for (const cambio of [{ capacity: 9 }, { capacity: 0 }, { shape: "TRIANGLE" }]) {
      const { error } = await servicio.from("dining_tables").update(cambio).eq("id", mesaId!);
      expect(error?.code).toBe("23514");
    }
    expect(await leerMesa()).toEqual({ shape: "SQUARE", capacity: 6 });
  });

  it("un mesero no puede cambiar la forma ni las sillas", async () => {
    const mesero = await iniciar("mesero@demo.altoque.pe");
    const { data, error } = await mesero.from("dining_tables").update({ shape: "ROUND", capacity: 2 }).eq("id", mesaId!).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await leerMesa()).toEqual({ shape: "SQUARE", capacity: 6 });
  });

  it("el dueño sí puede cambiarlas y siguen siendo una sola mesa", async () => {
    const dueno = await iniciar("dueno@demo.altoque.pe");
    const { data, error } = await dueno.from("dining_tables").update({ shape: "ROUND", capacity: 8 }).eq("id", mesaId!).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await leerMesa()).toEqual({ shape: "ROUND", capacity: 8 });
    const { count } = await servicio.from("qr_codes").select("id", { count: "exact", head: true }).eq("dining_table_id", mesaId!);
    expect(count).toBe(0);
  });
});
