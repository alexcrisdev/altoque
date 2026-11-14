import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const esLocal = (() => {
  try {
    const destino = new URL(url ?? "");
    return destino.protocol === "http:" && ["127.0.0.1", "localhost"].includes(destino.hostname);
  } catch { return false; }
})();
const restaurante = "10000000-0000-0000-0000-000000000001";
const otroRestaurante = "10000000-0000-0000-0000-000000000002";
const modelo = `us090-test-${randomUUID()}`;
const fecha = "2099-01-01";
const clientes: SupabaseClient[] = [];
let servicio: SupabaseClient;
let dueno: SupabaseClient;
let admin: SupabaseClient;
let cocina: SupabaseClient;
let anonimo: SupabaseClient;
let producto: string;
let otroProducto: string;
let huboIntentoDeEscritura = false;

function cliente(clave: string) {
  const nuevo = createClient(url!, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  clientes.push(nuevo);
  return nuevo;
}

async function autenticar(correo: string) {
  const nuevo = cliente(anonKey!);
  const { error } = await nuevo.auth.signInWithPassword({ email: correo, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${correo} para US-090.`);
  return nuevo;
}

function fila(restaurant_id = restaurante, product_id = producto) {
  return { restaurant_id, product_id, forecast_date: fecha, predicted_quantity: 46, model: modelo };
}

// No hace escrituras ni intenta autenticarse si el destino es la base compartida.
describe.skipIf(!esLocal)("US-090: RLS de predicciones (solo Supabase local)", () => {
  beforeAll(async () => {
    if (!anonKey || !serviceKey || !password) {
      throw new Error("Configura las claves de Supabase LOCAL y DEMO_PASSWORD para US-090.");
    }
    servicio = cliente(serviceKey);
    anonimo = cliente(anonKey);
    dueno = await autenticar("dueno@demo.altoque.pe");
    admin = await autenticar("admin@demo.altoque.pe");
    cocina = await autenticar("cocina@demo.altoque.pe");
    for (const id of [restaurante, otroRestaurante]) {
      const consulta = await servicio.from("products").select("id")
        .eq("restaurant_id", id).order("id").limit(1).single();
      if (consulta.error || !consulta.data) throw new Error("Faltan los productos demo locales para US-090.");
      if (id === restaurante) producto = consulta.data.id;
      else otroProducto = consulta.data.id;
    }
    huboIntentoDeEscritura = true;
    const carga = await servicio.from("demand_forecasts").insert([
      fila(), fila(otroRestaurante, otroProducto),
    ]);
    if (carga.error) throw new Error(`No se crearon los fixtures: ${carga.error.code}. Aplica primero la migración local.`);
  }, 30_000);

  afterAll(async () => {
    try {
      if (servicio && huboIntentoDeEscritura) {
        // Solo elimina las filas de esta ejecución; no altera predicciones existentes.
        const limpieza = await servicio.from("demand_forecasts").delete().eq("model", modelo);
        expect(limpieza.error, "Debe completarse la limpieza de los fixtures US-090").toBeNull();
      }
    } finally {
      const resultados = await Promise.allSettled(clientes.map(async (actual) => {
        const { error } = await actual.auth.signOut({ scope: "local" });
        if (error) throw error;
      }));
      expect(resultados.every(resultado => resultado.status === "fulfilled"), "Cerrar las sesiones de prueba").toBe(true);
    }
  }, 30_000);

  it.each(["OWNER", "ADMIN"])("%s lee la predicción de su restaurante", async (rol) => {
    const actual = rol === "OWNER" ? dueno : admin;
    const lectura = await actual.from("demand_forecasts").select("predicted_quantity")
      .eq("restaurant_id", restaurante).eq("model", modelo);
    expect(lectura.error).toBeNull();
    expect(lectura.data).toEqual([{ predicted_quantity: 46 }]);
  });

  it.each(["OWNER", "ADMIN"])("%s no lee la predicción de otro restaurante", async (rol) => {
    const actual = rol === "OWNER" ? dueno : admin;
    const lectura = await actual.from("demand_forecasts").select("id")
      .eq("restaurant_id", otroRestaurante).eq("model", modelo);
    expect(lectura.error).toBeNull();
    expect(lectura.data).toEqual([]);
  });

  it("KITCHEN no lee predicciones aunque pertenezca al restaurante", async () => {
    const lectura = await cocina.from("demand_forecasts").select("id").eq("model", modelo);
    expect(lectura.error).toBeNull();
    expect(lectura.data).toEqual([]);
  });

  it("el visitante anónimo no tiene permiso de lectura", async () => {
    const lectura = await anonimo.from("demand_forecasts").select("id").eq("model", modelo);
    expect(lectura.error?.code).toBe("42501");
  });

  it.each(["OWNER", "ADMIN"])("%s no puede insertar, actualizar ni eliminar predicciones", async (rol) => {
    const actual = rol === "OWNER" ? dueno : admin;
    const insertar = await actual.from("demand_forecasts").insert({ ...fila(), forecast_date: "2099-01-02" });
    expect(insertar.error?.code).toBe("42501");
    const actualizar = await actual.from("demand_forecasts").update({ predicted_quantity: 1 }).eq("model", modelo);
    expect(actualizar.error?.code).toBe("42501");
    const eliminar = await actual.from("demand_forecasts").delete().eq("model", modelo);
    expect(eliminar.error?.code).toBe("42501");
    const conservada = await servicio.from("demand_forecasts").select("predicted_quantity")
      .eq("restaurant_id", restaurante).eq("model", modelo);
    expect(conservada.error).toBeNull();
    expect(conservada.data).toEqual([{ predicted_quantity: 46 }]);
  });

  it("la cuenta de servicio puede repetir el upsert sin duplicar", async () => {
    for (let intento = 0; intento < 2; intento++) {
      const carga = await servicio.from("demand_forecasts").upsert(fila(), {
        onConflict: "restaurant_id,product_id,forecast_date,model",
      });
      expect(carga.error).toBeNull();
    }
    const lectura = await servicio.from("demand_forecasts").select("id")
      .eq("restaurant_id", restaurante).eq("model", modelo);
    expect(lectura.error).toBeNull();
    expect(lectura.data).toHaveLength(1);
  });

  it("rechaza asociar el producto de otro restaurante", async () => {
    const intento = await servicio.from("demand_forecasts").insert(fila(restaurante, otroProducto));
    expect(intento.error?.code).toBe("23503");
  });

  it("rechaza cantidades negativas", async () => {
    const intento = await servicio.from("demand_forecasts").insert({
      ...fila(), forecast_date: "2099-01-03", predicted_quantity: -1,
    });
    expect(intento.error?.code).toBe("23514");
  });
});
