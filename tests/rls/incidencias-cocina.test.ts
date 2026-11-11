import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clavePublica = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const restauranteId = "10000000-0000-0000-0000-000000000001";
let mesero: SupabaseClient | undefined;
let cocina: SupabaseClient | undefined;
let polleria: SupabaseClient | undefined;
let admin: SupabaseClient | undefined;
let meseroId: string;
let cocinaId: string;
let sesionId: string | undefined;
let pedidoId: string | undefined;

async function iniciar(correo: string) {
  const cliente = createClient(url!, clavePublica!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password: password! });
  if (error || !data.user) throw new Error(`No se pudo iniciar sesión demo: ${correo}`);
  return { cliente, usuarioId: data.user.id };
}

beforeAll(async () => {
  if (!url || !clavePublica || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD para la prueba US-017.");
  // Igual que US-014: usar una mesa libre propia y cancelar el pedido antes de cerrarla.
  const personalMesero = await iniciar("mesero@demo.altoque.pe");
  mesero = personalMesero.cliente;
  meseroId = personalMesero.usuarioId;
  const personalCocina = await iniciar("cocina@demo.altoque.pe");
  cocina = personalCocina.cliente;
  cocinaId = personalCocina.usuarioId;
  polleria = (await iniciar("dueno@polleria.demo")).cliente;
  admin = (await iniciar("admin@demo.altoque.pe")).cliente;

  const [mesas, sesiones, productos] = await Promise.all([
    mesero.from("dining_tables").select("id, branch_id").eq("restaurant_id", restauranteId).eq("active", true).order("number"),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restauranteId).is("closed_at", null),
    mesero.from("products").select("id").eq("restaurant_id", restauranteId).eq("active", true).eq("available", true).limit(1),
  ]);
  if (mesas.error || sesiones.error || productos.error) throw new Error("No se pudieron leer los datos demo US-017.");
  const ocupadas = new Set((sesiones.data ?? []).map((sesion) => sesion.dining_table_id));
  const mesa = mesas.data?.find((fila) => !ocupadas.has(fila.id));
  if (!mesa || !productos.data?.[0]) throw new Error("US-017 requiere una mesa libre y un producto disponible.");
  const apertura = await mesero.from("table_sessions").insert({
    restaurant_id: restauranteId, branch_id: mesa.branch_id, dining_table_id: mesa.id, opened_by: meseroId,
  }).select("id").single();
  if (apertura.error || !apertura.data) throw new Error("No se pudo abrir la mesa demo US-017.");
  sesionId = apertura.data.id;
  const registro = await mesero.rpc("registrar_pedido_mesero", {
    p_restaurant_id: restauranteId, p_modality: "DINE_IN", p_dining_table_id: mesa.id, p_branch_id: mesa.branch_id,
    p_idempotency_key: crypto.randomUUID(), p_items: [{ productoId: productos.data[0].id, cantidad: 1, observacion: "Prueba US-017" }],
  }).single();
  if (registro.error || !registro.data) throw new Error("No se pudo registrar el pedido demo US-017.");
  pedidoId = (registro.data as { pedido_id: string }).pedido_id;
}, 45_000);

afterAll(async () => {
  const errores: string[] = [];
  try {
    if (mesero && pedidoId) {
      const actual = await mesero.from("orders").select("status").eq("id", pedidoId).eq("restaurant_id", restauranteId).single();
      if (actual.error) errores.push("No se pudo verificar el pedido US-017 para limpiarlo.");
      else if (actual.data.status !== "CANCELLED") {
        if (actual.data.status === "READY" && cocina) {
          const deshacer = await cocina.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoId, p_estado: "IN_PROGRESS", p_motivo: null });
          if (deshacer.error) errores.push(`Deshacer para limpieza US-069: ${deshacer.error.code}`);
        }
        const cancelacion = await mesero.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoId, p_estado: "CANCELLED", p_motivo: "Prueba US-017" });
        if (cancelacion.error) errores.push(`Cancelación US-017: ${cancelacion.error.code}`);
      }
    }
    if (mesero && sesionId) {
      const lectura = await mesero.from("table_sessions").select("opened_at").eq("id", sesionId).eq("restaurant_id", restauranteId).is("closed_at", null).maybeSingle();
      if (lectura.error) errores.push(`Lectura de sesión US-017: ${lectura.error.code}`);
      else if (lectura.data) {
        const cierre = await mesero.from("table_sessions").update({
          closed_at: new Date(new Date(lectura.data.opened_at).getTime() + 1_000).toISOString(), closed_by: meseroId,
        }).eq("id", sesionId).eq("restaurant_id", restauranteId).is("closed_at", null).select("id");
        if (cierre.error || cierre.data?.length !== 1) errores.push("No se pudo confirmar el cierre de la mesa US-017.");
      }
    }
  } catch { errores.push("Falló la limpieza de US-017; revisar el pedido y la sesión de prueba."); }
  finally { await Promise.all([mesero?.auth.signOut(), cocina?.auth.signOut(), polleria?.auth.signOut(), admin?.auth.signOut()]); }
  if (errores.length) throw new Error(errores.join("; "));
}, 30_000);

describe("RLS de incidencias de cocina", () => {
  it("US-069: empieza en preparación con historial; solo cocina propia marca listo y deshace", async () => {
    const lectura = await mesero!.from("orders").select("status").eq("id", pedidoId!).eq("restaurant_id", restauranteId).single();
    expect(lectura.error).toBeNull();
    expect(lectura.data?.status).toBe("IN_PROGRESS");
    const inicial = await admin!.from("order_status_history").select("from_status, to_status, changed_by")
      .eq("restaurant_id", restauranteId).eq("order_id", pedidoId!).is("from_status", null).single();
    expect(inicial.error).toBeNull();
    expect(inicial.data).toMatchObject({ from_status: null, to_status: "IN_PROGRESS", changed_by: meseroId });
    const cambiar = (cliente: SupabaseClient, estado: string, motivo: string | null = null) =>
      cliente.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoId, p_estado: estado, p_motivo: motivo });
    expect((await cambiar(polleria!, "READY")).error?.message).toContain("FORBIDDEN");
    expect((await cambiar(mesero!, "READY")).error?.message).toContain("FORBIDDEN");
    expect((await cambiar(cocina!, "CANCELLED", "Sin permiso")).error?.message).toContain("FORBIDDEN");
    expect((await cambiar(cocina!, "READY")).error).toBeNull();
    expect((await cambiar(polleria!, "IN_PROGRESS")).error?.message).toContain("FORBIDDEN");
    expect((await cambiar(mesero!, "IN_PROGRESS")).error?.message).toContain("FORBIDDEN");
    expect((await cambiar(cocina!, "IN_PROGRESS")).error).toBeNull();
    expect((await cambiar(mesero!, "CANCELLED", "   ")).error?.message).toContain("REASON_REQUIRED");
    const historial = await admin!.from("order_status_history").select("from_status, to_status, changed_by")
      .eq("restaurant_id", restauranteId).eq("order_id", pedidoId!).eq("from_status", "READY").single();
    expect(historial.error).toBeNull();
    expect(historial.data).toMatchObject({ from_status: "READY", to_status: "IN_PROGRESS", changed_by: cocinaId });
    const ajeno = await polleria!.from("orders").select("id").eq("id", pedidoId!);
    expect(ajeno.error).toBeNull();
    expect(ajeno.data).toEqual([]);
  }, 30_000);
  it("US-017: cocina registra y resuelve SIN_INGREDIENTES; otro restaurante no la ve ni la gestiona", async () => {
    const registro = await cocina!.rpc("registrar_incidencia", {
      p_pedido_id: pedidoId, p_tipo: "SIN_INGREDIENTES", p_descripcion: "No hay limón",
    });
    expect(registro.error).toBeNull();
    expect(registro.data).toBeTruthy();
    const incidenciaId = registro.data as string;
    const lectura = await cocina!.from("order_incidents").select("id, status, created_by, created_at").eq("id", incidenciaId).single();
    expect(lectura.error).toBeNull();
    expect(lectura.data).toMatchObject({ id: incidenciaId, status: "OPEN", created_by: cocinaId });
    expect(lectura.data?.created_at).toBeTruthy();

    const ajena = await polleria!.from("order_incidents").select("id").eq("id", incidenciaId);
    expect(ajena.error).toBeNull();
    expect(ajena.data).toEqual([]);
    const intentoResolver = await polleria!.rpc("resolver_incidencia", { p_incidencia_id: incidenciaId });
    expect(intentoResolver.error?.message).toContain("FORBIDDEN");
    const intentoRegistrar = await polleria!.rpc("registrar_incidencia", { p_pedido_id: pedidoId, p_tipo: "OTRO", p_descripcion: "Intento de otro restaurante" });
    expect(intentoRegistrar.error?.message).toContain("FORBIDDEN");

    const resolucion = await cocina!.rpc("resolver_incidencia", { p_incidencia_id: incidenciaId });
    expect(resolucion.error).toBeNull();
    const resuelta = await cocina!.from("order_incidents").select("status, resolved_by, resolved_at").eq("id", incidenciaId).single();
    expect(resuelta.error).toBeNull();
    expect(resuelta.data).toMatchObject({ status: "RESOLVED", resolved_by: cocinaId });
    expect(resuelta.data?.resolved_at).toBeTruthy();
  }, 30_000);

  it("US-069: mesero cancela en preparación y deja el motivo en el historial", async () => {
    const motivo = "US-069: cancelación de prueba por mesero";
    const resultado = await mesero!.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoId, p_estado: "CANCELLED", p_motivo: motivo });
    expect(resultado.error).toBeNull();
    const historial = await admin!.from("order_status_history").select("from_status, to_status, reason, changed_by")
      .eq("restaurant_id", restauranteId).eq("order_id", pedidoId!).eq("to_status", "CANCELLED").single();
    expect(historial.error).toBeNull();
    expect(historial.data).toMatchObject({ from_status: "IN_PROGRESS", to_status: "CANCELLED", reason: motivo, changed_by: meseroId });
  }, 30_000);
});
