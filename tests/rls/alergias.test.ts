import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = (() => { try { return !!url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname); } catch { return false; } })();
const restaurante = "10000000-0000-0000-0000-000000000001";
let servicio: SupabaseClient;
let cocina: SupabaseClient;
let producto: string | undefined;
let qr: string;
const pedidos: string[] = [];
function exigir<T>({ data, error }: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (error || !data) throw new Error(error?.message ?? "Sin datos");
  return data;
}
function parametros() {
  return { p_qr_code_id: qr, p_idempotency_key: crypto.randomUUID(),
    p_items: [{ productoId: producto, cantidad: 1, observacion: "Prueba local US-091" }],
    p_modality: "TAKEAWAY", p_customer_name: "Prueba", p_customer_phone: "999999999",
    p_alergia_respuesta: "YES", p_alergenos: ["MANI"], p_alergia_detalle: "Evitar contacto" };
}

// Nunca autentica ni escribe en una base remota. Requiere migraciones y seed locales.
describe.skipIf(!local)("US-091: RPC y lectura KITCHEN con RLS (solo local)", () => {
  beforeAll(async () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_PASSWORD: password } = process.env;
    if (!anon || !key || !password) throw new Error("Falta configuración de Supabase local.");
    servicio = createClient(url!, key, { auth: { persistSession: false } });
    cocina = createClient(url!, anon, { auth: { persistSession: false } });
    const auth = await cocina.auth.signInWithPassword({ email: "cocina@demo.altoque.pe", password });
    if (auth.error) throw auth.error;
    qr = exigir(await servicio.from("qr_codes").select("id").eq("restaurant_id", restaurante)
      .eq("purpose", "TAKEAWAY").eq("active", true).limit(1).single<{ id: string }>()).id;
    producto = exigir(await servicio.from("products").insert({ restaurant_id: restaurante,
      category_id: "40000000-0000-0000-0000-000000000001", name: `US-091 ${crypto.randomUUID()}`,
      price: 10, active: true, available: true }).select("id").single<{ id: string }>()).id;
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const stock = await servicio.from("product_daily_stock").insert({ restaurant_id: restaurante, product_id: producto, stock_date: fecha, quantity: 20, sold: 0 });
    if (stock.error) throw stock.error;
  });
  afterAll(async () => {
    const errores: unknown[] = [];
    if (servicio) {
      if (pedidos.length) errores.push((await servicio.from("orders").delete().in("id", pedidos)).error);
      if (producto) {
        errores.push((await servicio.from("product_daily_stock").delete().eq("product_id", producto)).error);
        errores.push((await servicio.from("products").delete().eq("id", producto)).error);
      }
    }
    if (cocina) await cocina.auth.signOut();
    expect(errores.filter(Boolean)).toEqual([]);
  });
  it("guarda alergia y KITCHEN la lee; repetir clave no cambia la declaración", async () => {
    const entrada = parametros();
    const creado = exigir(await servicio.rpc("registrar_pedido_cliente", entrada).single<{ pedido_id: string }>());
    pedidos.push(creado.pedido_id);
    const repetido = exigir(await servicio.rpc("registrar_pedido_cliente", { ...entrada, p_alergenos: ["HUEVO"] }).single<{ pedido_id: string; repetido: boolean }>());
    expect(repetido.pedido_id).toBe(creado.pedido_id);
    expect(repetido.repetido).toBe(true);
    const fila = exigir(await cocina.from("orders").select("allergy_answer, allergens, allergy_note")
      .eq("restaurant_id", restaurante).eq("id", creado.pedido_id).single());
    expect(fila).toEqual({ allergy_answer: "YES", allergens: ["MANI"], allergy_note: "Evitar contacto" });
    const ajeno = await cocina.from("orders").select("id").neq("restaurant_id", restaurante);
    expect(ajeno.error).toBeNull(); expect(ajeno.data).toEqual([]);
  });
  it.each([
    { p_alergia_respuesta: null }, { p_alergenos: ["OTRO"] },
    { p_alergenos: [], p_alergia_detalle: " " }, { p_alergia_detalle: "x".repeat(121) },
  ])("rechaza declaración inválida: %j", async cambios => {
    const entrada = { ...parametros(), ...cambios };
    const resultado = await servicio.rpc("registrar_pedido_cliente", entrada);
    expect(resultado.error?.message).toContain("INVALID_ALLERGY");
    const filas = exigir(await servicio.from("orders").select("id").eq("idempotency_key", entrada.p_idempotency_key));
    expect(filas).toEqual([]);
  });
  it("no conserva la firma antigua de seis parámetros", async () => {
    const entrada = parametros();
    const { error } = await servicio.rpc("registrar_pedido_cliente", {
      p_qr_code_id: entrada.p_qr_code_id, p_idempotency_key: entrada.p_idempotency_key,
      p_items: entrada.p_items, p_modality: entrada.p_modality,
      p_customer_name: entrada.p_customer_name, p_customer_phone: entrada.p_customer_phone,
    });
    expect(error).not.toBeNull();
  });
});
