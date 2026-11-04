import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-020: cerrar la cuenta contra la base real (RPC cerrar_cuenta, triggers y RLS).
// Crea una mesa con un pedido y un pedido para llevar, ambos con el producto más
// barato. No usa la Mesa 5 (reservada para las pruebas E2E).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";
const MESA_RESERVADA_E2E = 5;
const motivo = "Prueba automática US-020: cortesía autorizada";

let mesero: SupabaseClient | undefined;
let meseroId: string | undefined;
let caja: SupabaseClient | undefined;
let cajaId: string | undefined;
let admin: SupabaseClient | undefined;
let adminId: string | undefined;
let cocina: SupabaseClient | undefined;
let duenoPolleria: SupabaseClient | undefined;
let anon: SupabaseClient | undefined;
let sessionId: string | undefined;
let pedidoMesaId: string | undefined;
let pedidoLlevarId: string | undefined;
let totalCentimos = 0;

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  const { data, error: errorUsuario } = await cliente.auth.getUser();
  if (errorUsuario || !data.user) throw new Error("No se pudo verificar el usuario demo");
  return { cliente, usuarioId: data.user.id };
}

const soles = (centimos: number) => (centimos / 100).toFixed(2);

function cerrar(cliente: SupabaseClient, cuenta: { sesion?: string; pedido?: string }, conMotivo: string | null = null) {
  return cliente.rpc("cerrar_cuenta", {
    p_sesion_id: cuenta.sesion ?? null, p_pedido_id: cuenta.pedido ?? null, p_motivo: conMotivo,
  }).single<{ cierre_id: string; tipo: string; consumo: number | string; pagado: number | string; saldo: number | string }>();
}

function pagar(cuenta: { sesion?: string; pedido?: string }, metodo: "CASH" | "YAPE", monto: number) {
  return caja!.rpc("registrar_pago", {
    p_sesion_id: cuenta.sesion ?? null, p_pedido_id: cuenta.pedido ?? null, p_metodo: metodo, p_monto: soles(monto),
    p_recibido: metodo === "CASH" ? soles(monto) : null, p_referencia: metodo === "YAPE" ? "PRUEBA-US020" : null,
    p_aprobado: null, p_clave: crypto.randomUUID(),
  }).single<{ pago_id: string; estado: string }>();
}

beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD en .env.local");
  const sesiones = await Promise.all([
    iniciar("mesero@demo.altoque.pe"), iniciar("caja@demo.altoque.pe"), iniciar("admin@demo.altoque.pe"),
    iniciar("cocina@demo.altoque.pe"), iniciar("dueno@polleria.demo"),
  ]);
  [mesero, caja, admin, cocina, duenoPolleria] = sesiones.map((s) => s.cliente);
  [meseroId, cajaId, adminId] = sesiones.map((s) => s.usuarioId);
  anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [mesas, productos, abiertas] = await Promise.all([
    mesero.from("dining_tables").select("id, branch_id, number").eq("restaurant_id", restaurantId).eq("active", true).order("number"),
    mesero.from("products").select("id, price").eq("restaurant_id", restaurantId).eq("active", true).eq("available", true)
      .order("price").limit(1),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restaurantId).is("closed_at", null),
  ]);
  if (mesas.error || productos.error || abiertas.error) throw new Error("No se pudieron consultar los datos demo para la prueba");
  const ocupadas = new Set((abiertas.data ?? []).map((s) => s.dining_table_id));
  const mesa = (mesas.data ?? []).find((fila) => !ocupadas.has(fila.id) && fila.number !== MESA_RESERVADA_E2E);
  const producto = productos.data?.[0];
  if (!mesa || !producto) throw new Error("Se requiere una mesa libre (distinta de la Mesa 5) y un producto activo");
  totalCentimos = Math.round(Number(producto.price) * 100);

  const { data: sesion, error: errorApertura } = await mesero.from("table_sessions").insert({
    restaurant_id: restaurantId, branch_id: mesa.branch_id, dining_table_id: mesa.id, opened_by: meseroId,
  }).select("id").single();
  if (errorApertura || !sesion) throw new Error("No se pudo abrir la sesión de mesa para la prueba");
  sessionId = sesion.id;

  const items = [{ productoId: producto.id, cantidad: 1, observacion: "Prueba US-020" }];
  const [enMesa, paraLlevar] = await Promise.all([
    mesero.rpc("registrar_pedido_mesero", {
      p_restaurant_id: restaurantId, p_modality: "DINE_IN", p_dining_table_id: mesa.id,
      p_branch_id: mesa.branch_id, p_idempotency_key: crypto.randomUUID(), p_items: items,
    }).single<{ pedido_id: string }>(),
    mesero.rpc("registrar_pedido_mesero", {
      p_restaurant_id: restaurantId, p_modality: "TAKEAWAY", p_dining_table_id: null,
      p_branch_id: mesa.branch_id, p_idempotency_key: crypto.randomUUID(), p_items: items,
    }).single<{ pedido_id: string }>(),
  ]);
  if (enMesa.error || !enMesa.data || paraLlevar.error || !paraLlevar.data) {
    throw new Error("No se pudieron crear los pedidos demo para la prueba");
  }
  pedidoMesaId = enMesa.data.pedido_id;
  pedidoLlevarId = paraLlevar.data.pedido_id;
}, 30_000);

afterAll(async () => {
  const errores: string[] = [];
  try {
    // Se cancelan para que no queden en cocina; pagos y cierres se conservan como registro.
    for (const pedidoId of [pedidoMesaId, pedidoLlevarId]) {
      if (!mesero || !pedidoId) continue;
      const { error } = await mesero.rpc("cambiar_estado_pedido", {
        p_pedido_id: pedidoId, p_estado: "CANCELLED", p_motivo: "Prueba automática",
      });
      if (error) errores.push(`No se pudo cancelar el pedido de prueba: ${error.message}`);
    }
    if (mesero && meseroId && sessionId) {
      const { data: sesion } = await mesero.from("table_sessions").select("opened_at")
        .eq("id", sessionId).is("closed_at", null).maybeSingle();
      if (sesion) {
        const { error } = await mesero.from("table_sessions")
          .update({ closed_at: new Date(new Date(sesion.opened_at).getTime() + 1_000).toISOString(), closed_by: meseroId })
          .eq("id", sessionId).is("closed_at", null);
        if (error) errores.push(`No se pudo cerrar la sesión de prueba: ${error.message}`);
      }
    }
  } finally {
    await Promise.all([mesero, caja, admin, cocina, duenoPolleria].map((c) => c?.auth.signOut()));
  }
  if (errores.length) throw new Error(errores.join("; "));
}, 30_000);

describe("US-020: cierre de una mesa", () => {
  it("con saldo pendiente no se cierra, ni desde caja ni con el botón del mesero", async () => {
    expect((await cerrar(caja!, { sesion: sessionId })).error?.message).toContain("SALDO_PENDIENTE");
    const { error } = await mesero!.from("table_sessions")
      .update({ closed_at: new Date().toISOString(), closed_by: meseroId }).eq("id", sessionId!);
    expect(error?.message).toContain("SALDO_PENDIENTE");
  });

  it("cocina, otro restaurante y anónimo no pueden cerrar", async () => {
    for (const cliente of [cocina!, duenoPolleria!]) {
      expect((await cerrar(cliente, { sesion: sessionId })).error?.message).toContain("FORBIDDEN");
    }
    expect((await cerrar(anon!, { sesion: sessionId })).error).not.toBeNull();
  });

  it("el cajero no puede autorizar una excepción", async () => {
    const { error } = await cerrar(caja!, { sesion: sessionId }, motivo);
    expect(error?.message).toContain("EXCEPTION_FORBIDDEN");
  });

  it("un Yape por verificar impide cerrar; al rechazarlo la cuenta sigue con saldo", async () => {
    const yape = await pagar({ sesion: sessionId }, "YAPE", totalCentimos);
    expect(yape.error).toBeNull();
    expect((await cerrar(admin!, { sesion: sessionId }, motivo)).error?.message).toContain("PENDING_PAYMENTS");

    const { error } = await caja!.rpc("verificar_pago", { p_pago_id: yape.data!.pago_id, p_confirmar: false });
    expect(error).toBeNull();
    expect((await cerrar(caja!, { sesion: sessionId })).error?.message).toContain("SALDO_PENDIENTE");
  });

  it("pagada completa: cierre ordinario con quién, cuándo e importe final", async () => {
    expect((await pagar({ sesion: sessionId }, "CASH", totalCentimos)).error).toBeNull();
    const { data, error } = await cerrar(caja!, { sesion: sessionId });
    expect(error).toBeNull();
    expect(data!.tipo).toBe("ORDINARY");
    expect(Math.round(Number(data!.consumo) * 100)).toBe(totalCentimos);
    expect(Number(data!.saldo)).toBe(0);

    const { data: cierre } = await caja!.from("account_closures")
      .select("kind, closed_by, closed_at, consumption, paid, balance, reason").eq("table_session_id", sessionId!).single();
    expect(cierre).toMatchObject({ kind: "ORDINARY", closed_by: cajaId, reason: null });
    expect(cierre!.closed_at).toBeTruthy();
    expect(Math.round(Number(cierre!.paid) * 100)).toBe(totalCentimos);

    const { data: sesion } = await caja!.from("table_sessions").select("closed_at, closed_by").eq("id", sessionId!).single();
    expect(sesion).toMatchObject({ closed_by: cajaId });
    expect(sesion!.closed_at).toBe(cierre!.closed_at);
  });

  it("el cierre no cambia el estado de preparación del pedido", async () => {
    const { data } = await caja!.from("orders").select("status").eq("id", pedidoMesaId!).single();
    expect(data!.status).toBe("PENDING");
  });

  it("una mesa cerrada no se vuelve a cerrar ni recibe pagos", async () => {
    expect((await cerrar(caja!, { sesion: sessionId })).error?.message).toContain("ACCOUNT_NOT_FOUND");
    expect((await pagar({ sesion: sessionId }, "CASH", 100)).error?.message).toContain("ACCOUNT_NOT_FOUND");
  });

  it("el dueño de otro restaurante y cocina no ven el cierre", async () => {
    for (const cliente of [duenoPolleria!, cocina!]) {
      const { data, error } = await cliente.from("account_closures").select("id").eq("table_session_id", sessionId!);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("nadie puede insertar un cierre directo, saltándose la función", async () => {
    const { error } = await admin!.from("account_closures").insert({
      restaurant_id: restaurantId, order_id: pedidoLlevarId, kind: "ORDINARY",
      consumption: 0, paid: 0, balance: 0, closed_by: adminId,
    });
    expect(error).not.toBeNull();
  });
});

describe("US-020: excepción autorizada en un pedido para llevar", () => {
  it("el admin cierra con saldo pendiente y queda el motivo", async () => {
    expect((await cerrar(admin!, { pedido: pedidoLlevarId }, "corto")).error?.message).toContain("REASON_REQUIRED");

    const { data, error } = await cerrar(admin!, { pedido: pedidoLlevarId }, motivo);
    expect(error).toBeNull();
    expect(data!.tipo).toBe("EXCEPTION");
    expect(Math.round(Number(data!.saldo) * 100)).toBe(totalCentimos);

    const { data: cierre } = await caja!.from("account_closures")
      .select("kind, closed_by, reason, balance").eq("order_id", pedidoLlevarId!).single();
    expect(cierre).toMatchObject({ kind: "EXCEPTION", closed_by: adminId, reason: motivo });
  });

  it("la cuenta cerrada ya no recibe pagos ni se cierra dos veces", async () => {
    expect((await pagar({ pedido: pedidoLlevarId }, "CASH", 100)).error?.message).toContain("ACCOUNT_CLOSED");
    expect((await cerrar(caja!, { pedido: pedidoLlevarId })).error?.message).toContain("ACCOUNT_CLOSED");
  });
});
