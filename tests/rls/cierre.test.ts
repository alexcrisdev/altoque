import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-020: cerrar la cuenta contra la base real (RPC cerrar_cuenta, triggers y RLS).
// US-063: la mesa no se cierra con pedidos sin entregar y, cerrada, sus pedidos no cambian.
// Crea una mesa con un pedido y un pedido para llevar, ambos con el producto más
// barato. Usa la primera mesa libre, igual que pagos.test.ts, y la deja cerrada al
// terminar; en CI no choca con las E2E porque comparten grupo de concurrencia.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";
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
    mesero.from("dining_tables").select("id, branch_id").eq("restaurant_id", restaurantId).eq("active", true).order("number"),
    mesero.from("products").select("id, price").eq("restaurant_id", restaurantId).eq("active", true).eq("available", true)
      .order("price").limit(1),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restaurantId).is("closed_at", null),
  ]);
  if (mesas.error || productos.error || abiertas.error) throw new Error("No se pudieron consultar los datos demo para la prueba");
  const ocupadas = new Set((abiertas.data ?? []).map((s) => s.dining_table_id));
  const mesa = (mesas.data ?? []).find((fila) => !ocupadas.has(fila.id));
  const producto = productos.data?.[0];
  if (!mesa || !producto) throw new Error("Se requiere una mesa libre y un producto activo en Cevichería demo");
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
    // Un pedido ya entregado (o ya cancelado) se deja como está: su mesa quedó cerrada (US-063).
    for (const pedidoId of [pedidoMesaId, pedidoLlevarId]) {
      if (!mesero || !pedidoId) continue;
      const { data: actual } = await mesero.from("orders").select("status").eq("id", pedidoId).maybeSingle();
      if (actual && ["DELIVERED", "CANCELLED"].includes(actual.status)) continue;
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

  it("US-063: con un pedido sin entregar tampoco hay excepción, y no queda cierre a medias", async () => {
    expect((await cerrar(admin!, { sesion: sessionId }, motivo)).error?.message).toContain("PEDIDOS_SIN_ENTREGAR");
    const { data } = await caja!.from("account_closures").select("id").eq("table_session_id", sessionId!);
    expect(data).toEqual([]);
  });

  it("US-063: pagada pero con el pedido en cocina o listo no se cierra, ni desde caja ni con el botón del mesero", async () => {
    expect((await pagar({ sesion: sessionId }, "CASH", totalCentimos)).error).toBeNull();
    const cerrarComoMesero = () => mesero!.from("table_sessions")
      .update({ closed_at: new Date().toISOString(), closed_by: meseroId }).eq("id", sessionId!);

    expect((await cerrar(caja!, { sesion: sessionId })).error?.message).toContain("PEDIDOS_SIN_ENTREGAR");
    expect((await cerrarComoMesero()).error?.message).toContain("PEDIDOS_SIN_ENTREGAR");

    const listo = await cocina!.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoMesaId!, p_estado: "READY", p_motivo: null });
    expect(listo.error).toBeNull();
    expect((await cerrar(caja!, { sesion: sessionId })).error?.message).toContain("PEDIDOS_SIN_ENTREGAR");
    expect((await cerrarComoMesero()).error?.message).toContain("PEDIDOS_SIN_ENTREGAR");

    const entregado = await mesero!.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoMesaId!, p_estado: "DELIVERED", p_motivo: null });
    expect(entregado.error).toBeNull();
  });

  it("pagada completa y entregada: cierre ordinario con quién, cuándo e importe final", async () => {
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

  it("el cierre no cambia el estado del pedido entregado", async () => {
    const { data } = await caja!.from("orders").select("status").eq("id", pedidoMesaId!).single();
    expect(data!.status).toBe("DELIVERED");
  });

  it("US-063: un pedido de la mesa cerrada no se cancela ni se modifica", async () => {
    const cancelar = await mesero!.rpc("cambiar_estado_pedido", {
      p_pedido_id: pedidoMesaId!, p_estado: "CANCELLED", p_motivo: "Prueba US-063",
    });
    expect(cancelar.error).not.toBeNull();
    const { data } = await caja!.from("orders").select("status").eq("id", pedidoMesaId!).single();
    expect(data!.status).toBe("DELIVERED");
  });

  // Con la clave de servicio (salta RLS) se prueba el trigger en sí. Los cambios dejan los
  // mismos valores: si faltara la migración, no se altera ningún dato de la base compartida.
  it.skipIf(!serviceKey)("US-063: la base rechaza cambiar el pedido o sus productos aunque se salte RLS", async () => {
    const servicio = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const pedido = await servicio.from("orders").update({ status: "DELIVERED" }).eq("id", pedidoMesaId!).select("id");
    expect(pedido.error?.message).toContain("ACCOUNT_CLOSED");

    const { data: linea } = await servicio.from("order_items").select("id, quantity").eq("order_id", pedidoMesaId!).limit(1).single();
    const producto = await servicio.from("order_items").update({ quantity: linea!.quantity }).eq("id", linea!.id).select("id");
    expect(producto.error?.message).toContain("ACCOUNT_CLOSED");
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
