import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-078: dos pedidos compiten por la única unidad disponible. La reserva debe
// ejecutarse en la misma transacción del pedido y devolver stock al cancelarlo.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const esLocal = (() => {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
})();
const restaurantId = "10000000-0000-0000-0000-000000000001";
const fecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

let owner: SupabaseClient;
let waiter: SupabaseClient;
let branchId: string;
let productoId: string;
let vendidosOriginal = 0;
let productosActivos: { id: string }[] = [];
let cantidadesOriginales = new Map<string, number | null>();
let pedidosCreados: string[] = [];

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  const { data } = await cliente.auth.getUser();
  if (!data.user) throw new Error("No se pudo verificar el usuario demo");
  return { cliente, id: data.user.id };
}

describe.skipIf(!esLocal)("US-078: descuento concurrente de stock", () => {
beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD para US-078.");
  const [dueno, mesero] = await Promise.all([
    iniciar("dueno@demo.altoque.pe"), iniciar("mesero@demo.altoque.pe"),
  ]);
  owner = dueno.cliente;
  waiter = mesero.cliente;

  const [productos, locales, stocks] = await Promise.all([
    owner.from("products").select("id").eq("restaurant_id", restaurantId).eq("active", true),
    owner.from("branches").select("id").eq("restaurant_id", restaurantId).eq("active", true).limit(1).single(),
    owner.from("product_daily_stock").select("product_id, quantity, sold").eq("restaurant_id", restaurantId).eq("stock_date", fecha),
  ]);
  if (productos.error || locales.error || stocks.error || !locales.data) throw new Error("No se pudo preparar la prueba de stock.");
  productosActivos = productos.data ?? [];
  branchId = locales.data.id;
  const porProducto = new Map((stocks.data ?? []).map((fila) => [fila.product_id, fila]));
  const elegido = productosActivos.find((p) => {
    const fila = porProducto.get(p.id);
    return !fila || fila.sold < fila.quantity;
  });
  if (!elegido) throw new Error("No hay un producto con stock modificable para la prueba.");
  productoId = elegido.id;
  vendidosOriginal = porProducto.get(productoId)?.sold ?? 0;
  cantidadesOriginales = new Map(productosActivos.map((p) => [p.id, porProducto.get(p.id)?.quantity ?? null]));

  const items = productosActivos.map((p) => ({
    productoId: p.id,
    cantidad: p.id === productoId ? vendidosOriginal + 1 : cantidadesOriginales.get(p.id) ?? null,
  }));
  const { error } = await owner.rpc("guardar_stock_diario", {
    p_restaurant_id: restaurantId, p_stock_date: fecha, p_items: items,
  });
  if (error) throw new Error(`No se pudo preparar el límite de stock: ${error.message}`);
}, 30_000);

afterAll(async () => {
  const errores: string[] = [];
  for (const pedidoId of pedidosCreados) {
    const { error } = await waiter.rpc("cambiar_estado_pedido", {
      p_pedido_id: pedidoId, p_estado: "CANCELLED", p_motivo: "Prueba automática US-078",
    });
    if (error && !error.message.includes("INVALID_TRANSITION")) errores.push("No se pudo cancelar el pedido de prueba.");
  }
  if (owner && productosActivos.length) {
    const { error } = await owner.rpc("guardar_stock_diario", {
      p_restaurant_id: restaurantId,
      p_stock_date: fecha,
      p_items: productosActivos.map((p) => ({ productoId: p.id, cantidad: cantidadesOriginales.get(p.id) ?? null })),
    });
    if (error) errores.push("No se pudo restaurar el stock de prueba.");
  }
  await Promise.all([owner?.auth.signOut(), waiter?.auth.signOut()]);
  if (errores.length) throw new Error(errores.join(" "));
}, 30_000);

  it("solo confirma uno de dos pedidos por la última unidad y devuelve stock al cancelar", async () => {
    const registrar = () => waiter.rpc("registrar_pedido_mesero", {
      p_restaurant_id: restaurantId,
      p_modality: "TAKEAWAY",
      p_dining_table_id: null,
      p_branch_id: branchId,
      p_idempotency_key: crypto.randomUUID(),
      p_items: [{ productoId, cantidad: 1, observacion: null }],
    }).single<{ pedido_id: string }>();

    const resultados = await Promise.all([registrar(), registrar()]);
    const exitosos = resultados.filter((r) => !r.error && r.data);
    const rechazados = resultados.filter((r) => r.error);
    pedidosCreados = exitosos.map((r) => r.data!.pedido_id);

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0].error?.message).toContain("STOCK_INSUFFICIENT");

    const { data: stock, error: errorStock } = await owner.from("product_daily_stock")
      .select("sold").eq("restaurant_id", restaurantId).eq("product_id", productoId).eq("stock_date", fecha).single();
    expect(errorStock).toBeNull();
    expect(stock?.sold).toBe(vendidosOriginal + 1);

    const { error: cancelacion } = await waiter.rpc("cambiar_estado_pedido", {
      p_pedido_id: pedidosCreados[0], p_estado: "CANCELLED", p_motivo: "Prueba automática US-078",
    });
    expect(cancelacion).toBeNull();
    pedidosCreados = [];

    const { data: stockDevuelto } = await owner.from("product_daily_stock")
      .select("sold").eq("restaurant_id", restaurantId).eq("product_id", productoId).eq("stock_date", fecha).single();
    expect(stockDevuelto?.sold).toBe(vendidosOriginal);

    const { error: ampliarStock } = await owner.rpc("guardar_stock_diario", {
      p_restaurant_id: restaurantId,
      p_stock_date: fecha,
      p_items: productosActivos.map((p) => ({
        productoId: p.id,
        cantidad: p.id === productoId ? vendidosOriginal + 2 : cantidadesOriginales.get(p.id) ?? null,
      })),
    });
    expect(ampliarStock).toBeNull();

    const { data: pedidoDoble, error: errorPedidoDoble } = await waiter.rpc("registrar_pedido_mesero", {
      p_restaurant_id: restaurantId,
      p_modality: "TAKEAWAY",
      p_dining_table_id: null,
      p_branch_id: branchId,
      p_idempotency_key: crypto.randomUUID(),
      p_items: [{ productoId, cantidad: 2, observacion: null }],
    }).single<{ pedido_id: string }>();
    expect(errorPedidoDoble).toBeNull();
    expect(pedidoDoble).not.toBeNull();
    pedidosCreados = [pedidoDoble!.pedido_id];

    const { data: linea } = await owner.from("order_items").select("id")
      .eq("order_id", pedidoDoble!.pedido_id).single();
    const { error: reducir } = await owner.rpc("modificar_pedido", {
      p_pedido_id: pedidoDoble!.pedido_id,
      p_cambios: [{ itemId: linea!.id, cantidad: 1 }],
      p_motivo: "Prueba automática US-078",
    });
    expect(reducir).toBeNull();
    const { data: stockReducido } = await owner.from("product_daily_stock")
      .select("sold").eq("restaurant_id", restaurantId).eq("product_id", productoId).eq("stock_date", fecha).single();
    expect(stockReducido?.sold).toBe(vendidosOriginal + 1);

    const { error: cancelarResto } = await owner.rpc("cambiar_estado_pedido", {
      p_pedido_id: pedidoDoble!.pedido_id, p_estado: "CANCELLED", p_motivo: "Prueba automática US-078",
    });
    expect(cancelarResto).toBeNull();
    pedidosCreados = [];
  }, 30_000);
});
