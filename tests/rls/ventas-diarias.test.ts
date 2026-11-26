import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-145: consolidación diaria de ventas contra Supabase local (función, RLS y permisos).
// Crea dos platos propios «antiguos» y mueve sus pedidos a días pasados al azar, para no
// chocar con datos de otras pruebas. Al terminar cancela sus pedidos y desactiva los platos.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";
const OBSERVACION_REAL = "Integración ventas diarias";

type Fila = {
  product_id: string; sales_date: string; units_ordered: number; initial_stock: number | null;
  sold_out: boolean; incomplete: boolean; incomplete_reason: string | null; consolidated_at: string;
};

let servicio: SupabaseClient;
const cuentas: Record<string, SupabaseClient> = {};
let branchId = "";
let platoA = "";
let platoB = "";
const pedidos: string[] = [];
let dias: string[] = []; // D1..D6

const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, opciones);
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  return cliente;
}

// Pedido para llevar del mesero, movido después a la fecha indicada (mediodía de Lima).
async function pedido(dia: string, productoId: string, cantidad: number, observacion = OBSERVACION_REAL) {
  const { data, error } = await cuentas.mesero.rpc("registrar_pedido_mesero", {
    p_restaurant_id: restaurantId, p_modality: "TAKEAWAY", p_dining_table_id: null, p_branch_id: branchId,
    p_idempotency_key: crypto.randomUUID(), p_items: [{ productoId, cantidad, observacion }],
  }).single<{ pedido_id: string }>();
  if (error || !data) throw new Error(`No se pudo crear el pedido de prueba: ${error?.message}`);
  pedidos.push(data.pedido_id);
  const mover = await servicio.from("orders").update({ created_at: `${dia}T12:00:00-05:00` }).eq("id", data.pedido_id);
  if (mover.error) throw new Error(`No se pudo mover el pedido: ${mover.error.message}`);
  return data.pedido_id;
}

async function cancelar(pedidoId: string) {
  const { error } = await cuentas.mesero.rpc("cambiar_estado_pedido", {
    p_pedido_id: pedidoId, p_estado: "CANCELLED", p_motivo: "Integración US-145",
  });
  if (error) throw new Error(`No se pudo cancelar: ${error.message}`);
}

const consolidar = () => servicio.rpc("consolidar_ventas_diarias", { p_desde: dias[0], p_hasta: dias[5] });

async function filas(cliente: SupabaseClient = servicio): Promise<Fila[]> {
  const { data, error } = await cliente.from("daily_product_sales")
    .select("product_id, sales_date, units_ordered, initial_stock, sold_out, incomplete, incomplete_reason, consolidated_at")
    .in("product_id", [platoA, platoB]).order("sales_date");
  if (error) throw new Error(error.message);
  return data as Fila[];
}
const fila = (lista: Fila[], producto: string, dia: string) =>
  lista.find((f) => f.product_id === producto && f.sales_date === dia);

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey || !password) throw new Error("Faltan variables de Supabase local");
  servicio = createClient(url, serviceKey, opciones);
  const [mesero, dueno, admin, cocina, caja] = await Promise.all([
    "mesero@demo.altoque.pe", "dueno@demo.altoque.pe", "admin@demo.altoque.pe", "cocina@demo.altoque.pe", "caja@demo.altoque.pe",
  ].map(iniciar));
  Object.assign(cuentas, { mesero, dueno, admin, cocina, caja });

  const [sucursal, categoria] = await Promise.all([
    servicio.from("branches").select("id").eq("restaurant_id", restaurantId).limit(1).single(),
    servicio.from("categories").select("id").eq("restaurant_id", restaurantId).eq("active", true).limit(1).single(),
  ]);
  if (sucursal.error || categoria.error) throw new Error("Faltan datos demo de Cevichería");
  branchId = sucursal.data.id;

  // Días pasados al azar (entre ~1,5 y ~12 años atrás): no se mezclan con otras corridas.
  const hoy = new Date().toISOString().slice(0, 10);
  const inicio = sumarDias(hoy, -(500 + Math.floor(Math.random() * 4000)));
  dias = [0, 1, 2, 3, 4, 5].map((n) => sumarDias(inicio, n));

  // Platos caros (no los elige ninguna otra prueba) que ya existían antes de D1.
  // El nombre es único por restaurante: cada corrida usa un sufijo propio.
  const sufijo = crypto.randomUUID().slice(0, 8);
  const creados = await servicio.from("products").insert([1, 2].map((n) => ({
    restaurant_id: restaurantId, category_id: categoria.data.id, name: `Plato integración US-145 ${n} ${sufijo}`,
    price: 999, created_at: `${sumarDias(inicio, -2)}T12:00:00-05:00`,
  }))).select("id, name");
  if (creados.error || creados.data.length !== 2) throw new Error("No se pudieron crear los platos de prueba");
  [platoA, platoB] = creados.data.sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.id);

  const [d1, d2, d3, d4, d5] = dias;
  // D1 normal: A pide 2 + 1; B no pide nada (demanda 0 real).
  await pedido(d1, platoA, 2);
  await pedido(d1, platoA, 1);
  // D2 agotado: stock de A 3 y se vendieron 3.
  await pedido(d2, platoA, 3);
  // D3 bloqueado: stock de A en 0 (candado); B mantiene el local abierto.
  await pedido(d3, platoB, 1);
  // D4 cancelado: 5 cancelados no cuentan; 1 real sí.
  await cancelar(await pedido(d4, platoA, 5));
  await pedido(d4, platoA, 1);
  // D5 pedidos de prueba (observación y nombre): no cuentan; 1 real sí.
  await pedido(d5, platoA, 4, "Prueba US-145 integración");
  const conNombre = await pedido(d5, platoA, 2);
  const nombre = await servicio.from("orders").update({ customer_name: "PRUEBA E2E integración" }).eq("id", conNombre);
  if (nombre.error) throw new Error("No se pudo marcar el pedido de prueba");
  await pedido(d5, platoA, 1);
  // D6: nadie pide nada en el restaurante (local cerrado).

  const stock = await servicio.from("product_daily_stock").insert([
    { restaurant_id: restaurantId, product_id: platoA, stock_date: d2, quantity: 3, sold: 3 },
    { restaurant_id: restaurantId, product_id: platoA, stock_date: d3, quantity: 0, sold: 0 },
  ]);
  if (stock.error) throw new Error(`No se pudo registrar el stock pasado: ${stock.error.message}`);
}, 60_000);

afterAll(async () => {
  const errores: string[] = [];
  try {
    for (const id of pedidos) {
      const { data } = await servicio.from("orders").select("status").eq("id", id).single<{ status: string }>();
      if (data && data.status !== "CANCELLED") await cancelar(id).catch((e) => errores.push(String(e)));
    }
    if (platoA) {
      const { error } = await servicio.from("products").update({ active: false }).in("id", [platoA, platoB]);
      if (error) errores.push("No se pudieron desactivar los platos de prueba");
    }
  } finally {
    await Promise.all(Object.values(cuentas).map((c) => c.auth.signOut({ scope: "local" })));
  }
  if (errores.length) throw new Error(errores.join("; "));
}, 60_000);

describe("US-145: ventas diarias consolidadas", () => {
  it("consolida los 6 días de ambos platos", async () => {
    const { error } = await consolidar();
    expect(error).toBeNull();
    expect(await filas()).toHaveLength(12);
  });

  it("día normal: suma unidades; un plato sin pedidos es demanda 0 completa", async () => {
    const lista = await filas();
    expect(fila(lista, platoA, dias[0])).toMatchObject({ units_ordered: 3, initial_stock: null, sold_out: false, incomplete: false, incomplete_reason: null });
    expect(fila(lista, platoB, dias[0])).toMatchObject({ units_ordered: 0, incomplete: false });
  });

  it("día agotado: guarda stock inicial y queda incompleto, no como demanda baja", async () => {
    expect(fila(await filas(), platoA, dias[1])).toMatchObject({
      units_ordered: 3, initial_stock: 3, sold_out: true, incomplete: true, incomplete_reason: "AGOTADO",
    });
  });

  it("día bloqueado (stock en 0): incompleto, no demanda 0", async () => {
    const lista = await filas();
    expect(fila(lista, platoA, dias[2])).toMatchObject({ units_ordered: 0, initial_stock: 0, incomplete: true, incomplete_reason: "BLOQUEADO" });
    expect(fila(lista, platoB, dias[2])).toMatchObject({ units_ordered: 1, incomplete: false });
  });

  it("excluye pedidos cancelados", async () => {
    expect(fila(await filas(), platoA, dias[3])).toMatchObject({ units_ordered: 1, incomplete: false });
  });

  it("excluye pedidos de prueba (por observación y por nombre, regla de US-111)", async () => {
    expect(fila(await filas(), platoA, dias[4])).toMatchObject({ units_ordered: 1, incomplete: false });
  });

  it("día sin ningún pedido real: local cerrado, incompleto", async () => {
    const lista = await filas();
    for (const plato of [platoA, platoB]) {
      expect(fila(lista, plato, dias[5])).toMatchObject({ units_ordered: 0, incomplete: true, incomplete_reason: "LOCAL_CERRADO" });
    }
  });

  it("repetir no duplica ni altera las cifras (ni la hora de consolidación)", async () => {
    const antes = await filas();
    const { data, error } = await consolidar();
    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await filas()).toEqual(antes);
  });

  it("una cancelación tardía se corrige en la siguiente corrida", async () => {
    const primero = pedidos[1]; // D1, 1 unidad
    await cancelar(primero);
    const { data } = await consolidar();
    expect(data).toBe(1);
    expect(fila(await filas(), platoA, dias[0])?.units_ordered).toBe(2);
  });

  it("solo dueño y admin leen; mesero, cocina y caja no ven nada", async () => {
    expect(await filas(cuentas.dueno)).toHaveLength(12);
    expect(await filas(cuentas.admin)).toHaveLength(12);
    for (const rol of ["mesero", "cocina", "caja"]) expect(await filas(cuentas[rol]), rol).toEqual([]);
  });

  it("nadie de la app escribe ni ejecuta la consolidación", async () => {
    const anon = createClient(url!, anonKey!, opciones);
    for (const cliente of [cuentas.dueno, cuentas.admin, anon]) {
      const ejecutar = await cliente.rpc("consolidar_ventas_diarias", { p_desde: dias[0], p_hasta: dias[5] });
      expect(ejecutar.error).not.toBeNull();
      const escribir = await cliente.from("daily_product_sales").update({ units_ordered: 99 }).eq("product_id", platoA).select("id");
      expect(escribir.error !== null || escribir.data?.length === 0).toBe(true);
    }
    expect(fila(await filas(), platoA, dias[1])?.units_ordered).toBe(3);
  });

  it("no consolida el día de hoy ni rangos de más de 62 días", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
    expect((await servicio.rpc("consolidar_ventas_diarias", { p_desde: hoy, p_hasta: hoy })).error?.message).toContain("INVALID_RANGE");
    expect((await servicio.rpc("consolidar_ventas_diarias", { p_desde: dias[0], p_hasta: sumarDias(dias[0], 62) })).error?.message)
      .toContain("INVALID_RANGE");
  });
});
