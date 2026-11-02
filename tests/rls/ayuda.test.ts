import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
// Solo esta preparación de pruebas en Node usa la clave del servidor; nunca el navegador.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restauranteId = "10000000-0000-0000-0000-000000000001";
let mesero: SupabaseClient;
let cocina: SupabaseClient;
let polleria: SupabaseClient;
let anonimo: SupabaseClient;
let servidor: SupabaseClient;
let usuarioId: string;
let qrId: string;
let mesaId: string;
let sesionId: string | undefined;
let abiertaEn: string;
let solicitudId: string | undefined;
let sesionCerrada = false;

function cliente(clave: string) {
  return createClient(url!, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function iniciar(email: string) {
  const supabase = cliente(anonKey!);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: password! });
  if (error || !data.user) throw new Error("No se pudo iniciar sesión con el usuario demo de ayuda");
  return { supabase, usuario: data.user.id };
}

async function cerrarSesionPropia() {
  if (!sesionId || sesionCerrada) return;
  const closedAt = new Date(Math.max(Date.now(), Date.parse(abiertaEn) + 1000)).toISOString();
  const { error } = await mesero.from("table_sessions")
    .update({ closed_at: closedAt, closed_by: usuarioId })
    .eq("id", sesionId).eq("restaurant_id", restauranteId).is("closed_at", null);
  if (error) throw new Error("No se pudo cerrar la sesión propia de pruebas de ayuda");
  sesionCerrada = true;
}

beforeAll(async () => {
  if (!url || !anonKey || !password || !serviceKey) {
    throw new Error("Configura Supabase, DEMO_PASSWORD y la clave de servidor para preparar ayuda en Node");
  }
  const m = await iniciar("mesero@demo.altoque.pe");
  mesero = m.supabase;
  usuarioId = m.usuario;
  cocina = (await iniciar("cocina@demo.altoque.pe")).supabase;
  polleria = (await iniciar("dueno@polleria.demo")).supabase;
  anonimo = cliente(anonKey);
  servidor = cliente(serviceKey);

  const [mesas, qrs, sesiones, ayudas] = await Promise.all([
    mesero.from("dining_tables").select("id, number, branch_id").eq("restaurant_id", restauranteId).eq("active", true).order("number"),
    mesero.from("qr_codes").select("id, dining_table_id").eq("restaurant_id", restauranteId).eq("purpose", "DINE_IN").eq("active", true),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restauranteId).is("closed_at", null),
    mesero.from("help_requests").select("qr_code_id").eq("restaurant_id", restauranteId).eq("status", "OPEN"),
  ]);
  if ([mesas, qrs, sesiones, ayudas].some((r) => r.error)) throw new Error("No se pudieron preparar los datos de ayuda; verifica la migración aplicada");
  const ocupadas = new Set(sesiones.data!.map((s) => s.dining_table_id));
  const conAyuda = new Set(ayudas.data!.map((a) => a.qr_code_id));
  const mesa = mesas.data!.find((m) => m.number !== 3 && !ocupadas.has(m.id)
    && qrs.data!.some((q) => q.dining_table_id === m.id && !conAyuda.has(q.id)));
  if (!mesa) throw new Error("Prepara una mesa demo libre, distinta de Mesa 3, con QR activo y sin ayuda pendiente");
  mesaId = mesa.id;
  qrId = qrs.data!.find((q) => q.dining_table_id === mesaId)!.id;
  const { data: sesion, error } = await mesero.from("table_sessions").insert({
    restaurant_id: restauranteId, branch_id: mesa.branch_id, dining_table_id: mesaId, opened_by: usuarioId,
  }).select("id, opened_at").single();
  if (sesion) { sesionId = sesion.id; abiertaEn = sesion.opened_at; }
  if (error || !sesionId) throw new Error("No se pudo abrir la sesión de ayuda de prueba");
  const registro = await servidor.rpc("solicitar_ayuda", { p_qr_code_id: qrId });
  if (typeof registro.data === "string") solicitudId = registro.data;
  if (registro.error || !solicitudId) throw new Error("No se pudo crear la solicitud desde el servidor de pruebas");
}, 30_000);

afterAll(async () => {
  try {
    if (solicitudId && mesero) {
      const { data, error } = await mesero.from("help_requests").select("status")
        .eq("id", solicitudId).eq("restaurant_id", restauranteId).single();
      if (error) throw new Error("No se pudo verificar la limpieza de la solicitud propia");
      if (data.status === "OPEN") {
        const atendida = await mesero.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
        if (atendida.error) throw new Error("No se pudo atender la solicitud de prueba para limpiarla");
      }
    }
  } finally {
    try { await cerrarSesionPropia(); } finally {
      await Promise.all([mesero?.auth.signOut({ scope: "local" }), cocina?.auth.signOut({ scope: "local" }), polleria?.auth.signOut({ scope: "local" })]);
    }
  }
}, 30_000);

describe("RLS de solicitudes de ayuda US-013", () => {
  it.each(["anonimo", "mesero"] as const)("%s no puede solicitar ayuda llamando directamente a la RPC", async (actor) => {
    const supabase = actor === "anonimo" ? anonimo : mesero;
    const { error } = await supabase.rpc("solicitar_ayuda", { p_qr_code_id: qrId });
    expect(error?.code).toBe("42501");
  });

  it("el servidor crea con la mesa, sesión y restaurante derivados del QR", async () => {
    const { data, error } = await mesero.from("help_requests")
      .select("id, restaurant_id, qr_code_id, dining_table_id, table_session_id, status")
      .eq("id", solicitudId!).eq("restaurant_id", restauranteId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: solicitudId, restaurant_id: restauranteId, qr_code_id: qrId,
      dining_table_id: mesaId, table_session_id: sesionId, status: "OPEN" });
  });

  it("dos solicitudes simultáneas para el mismo QR devuelven la misma OPEN", async () => {
    const resultados = await Promise.all([servidor.rpc("solicitar_ayuda", { p_qr_code_id: qrId }),
      servidor.rpc("solicitar_ayuda", { p_qr_code_id: qrId })]);
    resultados.forEach((r) => { expect(r.error).toBeNull(); expect(r.data).toBe(solicitudId); });
    const { data, error } = await mesero.from("help_requests").select("id")
      .eq("restaurant_id", restauranteId).eq("qr_code_id", qrId).eq("status", "OPEN");
    expect(error).toBeNull(); expect(data).toEqual([{ id: solicitudId }]);
  });

  it("la Pollería no puede leer ni atender una solicitud de Cevichería", async () => {
    const lectura = await polleria.from("help_requests").select("id").eq("restaurant_id", restauranteId).eq("id", solicitudId!);
    expect(lectura.error).toBeNull(); expect(lectura.data).toEqual([]);
    const atencion = await polleria.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(atencion.error?.code).toBe("42501");
  });

  it("cocina no puede leer ni atender las solicitudes", async () => {
    const lectura = await cocina.from("help_requests").select("id").eq("restaurant_id", restauranteId).eq("id", solicitudId!);
    expect(lectura.error).toBeNull(); expect(lectura.data).toEqual([]);
    const atencion = await cocina.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(atencion.error?.code).toBe("42501");
  });

  it("el mesero no puede insertar o actualizar directamente la tabla", async () => {
    const insertar = await mesero.from("help_requests").insert({ qr_code_id: qrId, restaurant_id: restauranteId });
    expect(insertar.error?.code).toBe("42501");
    const actualizar = await mesero.from("help_requests").update({ status: "ATTENDED", attended_at: new Date().toISOString(), attended_by: usuarioId }).eq("id", solicitudId!);
    expect(actualizar.error?.code).toBe("42501");
  });

  it("el anónimo no puede atender solicitudes", async () => {
    const { error } = await anonimo.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(error?.code).toBe("42501");
  });

  it("el mesero atiende la solicitud y queda registrado como autor", async () => {
    const { error } = await mesero.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(error).toBeNull();
    const lectura = await mesero.from("help_requests").select("status, attended_by, attended_at")
      .eq("restaurant_id", restauranteId).eq("id", solicitudId!).single();
    expect(lectura.error).toBeNull();
    expect(lectura.data).toMatchObject({ status: "ATTENDED", attended_by: usuarioId, attended_at: expect.any(String) });
  });

  it("rechaza atender dos veces y pedir ayuda desde la sesión ya cerrada", async () => {
    const repetida = await mesero.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(repetida.error?.message).toContain("ALREADY_ATTENDED");
    await cerrarSesionPropia();
    const cerrada = await servidor.rpc("solicitar_ayuda", { p_qr_code_id: qrId });
    expect(cerrada.error?.message).toContain("TABLE_NOT_OPEN");
  });
});
