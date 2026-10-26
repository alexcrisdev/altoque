import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const cevicheriaId = "10000000-0000-0000-0000-000000000001";

let mesero: SupabaseClient | undefined;
let meseroId: string | undefined;
let cocina: SupabaseClient | undefined;
let cocinaId: string | undefined;
let duenoPolleria: SupabaseClient | undefined;
let mesaId: string | undefined;
let branchId: string | undefined;
let sesionId: string | undefined;

async function iniciarDemo(email: string): Promise<{ cliente: SupabaseClient; usuarioId: string }> {
  const cliente = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: errorLogin } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (errorLogin) throw new Error("No se pudo iniciar sesión con el usuario demo necesario para la prueba");

  const { data, error } = await cliente.auth.getUser();
  if (error || !data.user) throw new Error("No se pudo verificar el usuario demo de la prueba");
  return { cliente, usuarioId: data.user.id };
}

async function cerrarSesionDePrueba(): Promise<number> {
  const { data: sesion, error: errorLectura } = await mesero!
    .from("table_sessions")
    .select("opened_at")
    .eq("id", sesionId!)
    .eq("restaurant_id", cevicheriaId)
    .is("closed_at", null)
    .maybeSingle();

  if (errorLectura) throw new Error("No se pudo consultar la sesión de prueba para cerrarla");
  if (!sesion) return 0;

  // Usar el opened_at persistido evita diferencias de reloj entre Node y PostgreSQL.
  const closedAt = new Date(new Date(sesion.opened_at).getTime() + 1_000).toISOString();
  const { data, error } = await mesero!
    .from("table_sessions")
    .update({ closed_at: closedAt, closed_by: meseroId! })
    .eq("id", sesionId!)
    .eq("restaurant_id", cevicheriaId)
    .is("closed_at", null)
    .select("id");

  if (error) throw new Error("No se pudo cerrar la sesión de prueba");
  return data.length;
}

beforeAll(async () => {
  if (!url || !anonKey || !password) {
    throw new Error("Configura URL, clave pública y DEMO_PASSWORD en .env.local");
  }

  const [sesionMesero, sesionCocina, sesionDuenoPolleria] = await Promise.all([
    iniciarDemo("mesero@demo.altoque.pe"),
    iniciarDemo("cocina@demo.altoque.pe"),
    iniciarDemo("dueno@polleria.demo"),
  ]);
  mesero = sesionMesero.cliente;
  meseroId = sesionMesero.usuarioId;
  cocina = sesionCocina.cliente;
  cocinaId = sesionCocina.usuarioId;
  duenoPolleria = sesionDuenoPolleria.cliente;

  const { data: mesas, error: errorMesas } = await mesero
    .from("dining_tables")
    .select("id, branch_id")
    .eq("restaurant_id", cevicheriaId)
    .eq("active", true)
    .order("number");
  if (errorMesas) throw new Error("No se pudieron consultar las mesas demo para la prueba");

  const { data: sesionesAbiertas, error: errorSesiones } = await mesero
    .from("table_sessions")
    .select("dining_table_id")
    .eq("restaurant_id", cevicheriaId)
    .is("closed_at", null);
  if (errorSesiones) throw new Error("No se pudieron consultar las sesiones demo para la prueba");

  const mesasOcupadas = new Set((sesionesAbiertas ?? []).map((sesion) => sesion.dining_table_id));
  const mesaLibre = (mesas ?? []).find((mesa) => !mesasOcupadas.has(mesa.id));
  if (!mesaLibre) {
    throw new Error("No hay una mesa demo activa y libre; libera una desde /mesero y vuelve a intentar");
  }

  mesaId = mesaLibre.id;
  branchId = mesaLibre.branch_id;
}, 30_000);

afterAll(async () => {
  try {
    if (mesero && meseroId && sesionId) {
      // Conserva el historial: la limpieza solo cierra una sesión que siga abierta.
      await cerrarSesionDePrueba();
    }
  } finally {
    await Promise.all([
      mesero?.auth.signOut(),
      cocina?.auth.signOut(),
      duenoPolleria?.auth.signOut(),
    ]);
  }
}, 30_000);

describe("RLS de sesiones de mesa", () => {
  it("permite al mesero abrir una sesión para una mesa libre", async () => {
    const { data, error } = await mesero!.from("table_sessions").insert({
      restaurant_id: cevicheriaId,
      branch_id: branchId!,
      dining_table_id: mesaId!,
      opened_by: meseroId!,
    }).select("id, opened_at").single();

    if (data?.id) sesionId = data.id;
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  }, 30_000);

  it("rechaza el segundo intento de abrir sesión en esa mesa", async () => {
    const { error } = await mesero!.from("table_sessions").insert({
      restaurant_id: cevicheriaId,
      branch_id: branchId!,
      dining_table_id: mesaId!,
      opened_by: meseroId!,
    });

    expect(error?.code).toBe("23505");
  }, 30_000);

  it("impide que cocina abra una sesión", async () => {
    const { data, error } = await cocina!.from("table_sessions").insert({
      restaurant_id: cevicheriaId,
      branch_id: branchId!,
      dining_table_id: mesaId!,
      opened_by: cocinaId!,
    }).select("id");

    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  }, 30_000);

  it("oculta las sesiones de Cevichería al dueño de Pollería", async () => {
    const { data, error } = await duenoPolleria!
      .from("table_sessions")
      .select("id")
      .eq("restaurant_id", cevicheriaId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 30_000);

  it("no permite reabrir ni modificar una sesión cerrada", async () => {
    const cantidadCerrada = await cerrarSesionDePrueba();
    expect(cantidadCerrada).toBe(1);

    const reapertura = await mesero!
      .from("table_sessions")
      .update({ closed_at: null, closed_by: null })
      .eq("id", sesionId!)
      .select("id");
    expect(reapertura.error).toBeNull();
    expect(reapertura.data).toEqual([]);

    const modificacion = await mesero!
      .from("table_sessions")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", sesionId!)
      .select("id");
    expect(modificacion.error).toBeNull();
    expect(modificacion.data).toEqual([]);

    const { data: verificacion, error: errorVerificacion } = await mesero!
      .from("table_sessions")
      .select("closed_at")
      .eq("id", sesionId!)
      .single();
    expect(errorVerificacion).toBeNull();
    expect(verificacion?.closed_at).not.toBeNull();
  }, 30_000);
});
