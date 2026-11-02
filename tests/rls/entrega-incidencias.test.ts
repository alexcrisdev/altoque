import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";

let mesero: SupabaseClient | undefined;
let meseroId: string | undefined;
let cocina: SupabaseClient | undefined;
let duenoPolleria: SupabaseClient | undefined;
let anon: SupabaseClient | undefined;
let mesaId: string | undefined;
let branchId: string | undefined;
let sessionId: string | undefined;
let orderId: string | undefined;
let incidentId: string | undefined;

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  const { data, error: errorUsuario } = await cliente.auth.getUser();
  if (errorUsuario || !data.user) throw new Error("No se pudo verificar el usuario demo");
  return { cliente, usuarioId: data.user.id };
}

beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD en .env.local");
  const [sesionMesero, sesionCocina, sesionDueno] = await Promise.all([
    iniciar("mesero@demo.altoque.pe"), iniciar("cocina@demo.altoque.pe"), iniciar("dueno@polleria.demo"),
  ]);
  mesero = sesionMesero.cliente;
  meseroId = sesionMesero.usuarioId;
  cocina = sesionCocina.cliente;
  duenoPolleria = sesionDueno.cliente;
  anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: mesas, error: errorMesas }, { data: productos, error: errorProductos }, { data: sesiones, error: errorSesiones }] = await Promise.all([
    mesero.from("dining_tables").select("id, branch_id").eq("restaurant_id", restaurantId).eq("active", true).order("number"),
    mesero.from("products").select("id").eq("restaurant_id", restaurantId).eq("active", true).eq("available", true).limit(1),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restaurantId).is("closed_at", null),
  ]);
  if (errorMesas || errorProductos || errorSesiones) throw new Error("No se pudieron consultar los datos demo para la prueba");
  const ocupadas = new Set((sesiones ?? []).map((sesion) => sesion.dining_table_id));
  const mesa = (mesas ?? []).find((fila) => !ocupadas.has(fila.id));
  if (!mesa || !productos?.[0]) throw new Error("Se requiere una mesa libre y un producto activo en Cevichería demo");
  mesaId = mesa.id;
  branchId = mesa.branch_id;

  const { data: sesion, error: errorApertura } = await mesero.from("table_sessions").insert({
    restaurant_id: restaurantId, branch_id: branchId, dining_table_id: mesaId, opened_by: meseroId,
  }).select("id").single();
  if (errorApertura || !sesion) throw new Error("No se pudo abrir la sesión de mesa para la prueba");
  sessionId = sesion.id;

  const { data: pedido, error: errorPedido } = await mesero.rpc("registrar_pedido_mesero", {
    p_restaurant_id: restaurantId, p_modality: "DINE_IN", p_dining_table_id: mesaId,
    p_branch_id: branchId, p_idempotency_key: crypto.randomUUID(),
    p_items: [{ productoId: productos[0].id, cantidad: 1, observacion: "Prueba US-014" }],
  }).single();
  if (errorPedido || !pedido) throw new Error("No se pudo crear el pedido demo para la prueba");
  orderId = (pedido as { pedido_id: string }).pedido_id;
}, 30_000);

afterAll(async () => {
  try {
    if (mesero && orderId) {
      // La cancelación conserva el historial de auditoría y deja el pedido fuera de servicio.
      await mesero.rpc("cambiar_estado_pedido", { p_pedido_id: orderId, p_estado: "CANCELLED", p_motivo: "Limpieza prueba US-014" });
    }
    if (mesero && meseroId && sessionId) {
      const { data: sesion } = await mesero.from("table_sessions").select("opened_at").eq("id", sessionId).eq("restaurant_id", restaurantId).is("closed_at", null).maybeSingle();
      if (sesion) {
        await mesero.from("table_sessions").update({ closed_at: new Date(new Date(sesion.opened_at).getTime() + 1_000).toISOString(), closed_by: meseroId })
          .eq("id", sessionId).eq("restaurant_id", restaurantId).is("closed_at", null);
      }
    }
  } finally {
    await Promise.all([mesero?.auth.signOut(), cocina?.auth.signOut(), duenoPolleria?.auth.signOut()]);
  }
}, 30_000);

describe("RLS y RPC de incidencias de pedidos", () => {
  it("permite al mesero registrar y resolver una incidencia propia", async () => {
    const { data, error } = await mesero!.rpc("registrar_incidencia", {
      p_pedido_id: orderId!, p_tipo: "FALTANTE", p_descripcion: "Falta una bebida",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    incidentId = data as string;

    const { data: incidencia, error: errorLectura } = await mesero!.from("order_incidents")
      .select("id, status, created_by").eq("id", incidentId).single();
    expect(errorLectura).toBeNull();
    expect(incidencia).toMatchObject({ id: incidentId, status: "OPEN", created_by: meseroId });

    const { error: errorResolucion } = await mesero!.rpc("resolver_incidencia", { p_incidencia_id: incidentId });
    expect(errorResolucion).toBeNull();
    const { data: resuelta, error: errorVerificacion } = await mesero!.from("order_incidents")
      .select("status, resolved_by, resolved_at").eq("id", incidentId).single();
    expect(errorVerificacion).toBeNull();
    expect(resuelta).toMatchObject({ status: "RESOLVED", resolved_by: meseroId });
    expect(resuelta?.resolved_at).toBeTruthy();
  }, 30_000);

  it("permite a cocina consultar, registrar y resolver incidencias", async () => {
    const { data: consulta, error } = await cocina!.from("order_incidents").select("id, status").eq("id", incidentId!).single();
    expect(error).toBeNull();
    expect(consulta).toMatchObject({ id: incidentId, status: "RESOLVED" });

    const { data: nueva, error: errorRegistro } = await cocina!.rpc("registrar_incidencia", {
      p_pedido_id: orderId!, p_tipo: "SIN_INGREDIENTES", p_descripcion: "No hay harina disponible",
    });
    expect(errorRegistro).toBeNull();
    expect(nueva).toBeTruthy();

    const { error: errorResolucion } = await cocina!.rpc("resolver_incidencia", { p_incidencia_id: nueva as string });
    expect(errorResolucion).toBeNull();
    const { data: resuelta, error: errorVerificacion } = await cocina!.from("order_incidents")
      .select("status, resolved_by, resolved_at").eq("id", nueva as string).single();
    expect(errorVerificacion).toBeNull();
    expect(resuelta).toMatchObject({ status: "RESOLVED" });
    expect(resuelta?.resolved_by).toBeTruthy();
    expect(resuelta?.resolved_at).toBeTruthy();
  }, 30_000);

  it("impide que el dueño de otro restaurante acceda a estas incidencias", async () => {
    const { data, error } = await duenoPolleria!.from("order_incidents").select("id").eq("order_id", orderId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const intento = await duenoPolleria!.rpc("registrar_incidencia", {
      p_pedido_id: orderId!, p_tipo: "ERROR", p_descripcion: "Intento desde otro restaurante",
    });
    expect(intento.error).not.toBeNull();
    expect(intento.error?.message).toContain("FORBIDDEN");
  }, 30_000);

  it("bloquea el acceso anónimo de lectura y escritura", async () => {
    const lectura = await anon!.from("order_incidents").select("id").eq("order_id", orderId!);
    expect(lectura.error).not.toBeNull();
    expect(lectura.data).toBeNull();
    const intento = await anon!.rpc("registrar_incidencia", {
      p_pedido_id: orderId!, p_tipo: "OTRO", p_descripcion: "Intento anónimo",
    });
    expect(intento.error).not.toBeNull();
  }, 30_000);
});
