import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-022 / US-023 / US-024: cobro en efectivo, Yape y tarjeta contra la base real
// (RPC registrar_pago, verificar_pago y RLS).
// Usa el producto más barato para que los pagos de prueba sumen poco.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";

let mesero: SupabaseClient | undefined;
let meseroId: string | undefined;
let caja: SupabaseClient | undefined;
let cajaId: string | undefined;
let cocina: SupabaseClient | undefined;
let duenoPolleria: SupabaseClient | undefined;
let anon: SupabaseClient | undefined;
let sessionId: string | undefined;
let orderId: string | undefined;
let totalCentimos = 0;
let yapeRechazado: string | undefined;

async function iniciar(email: string) {
  const cliente = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}`);
  const { data, error: errorUsuario } = await cliente.auth.getUser();
  if (errorUsuario || !data.user) throw new Error("No se pudo verificar el usuario demo");
  return { cliente, usuarioId: data.user.id };
}

const soles = (centimos: number) => (centimos / 100).toFixed(2);

function pagarEfectivo(cliente: SupabaseClient, monto: number, recibido: number, clave = crypto.randomUUID()) {
  return cliente.rpc("registrar_pago", {
    p_sesion_id: sessionId, p_pedido_id: null, p_metodo: "CASH", p_monto: soles(monto), p_recibido: soles(recibido),
    p_referencia: null, p_aprobado: null, p_clave: clave,
  }).single<{ pago_id: string; estado: string; vuelto: number | string }>();
}

function pagarTarjeta(cliente: SupabaseClient, monto: number, referencia: string, aprobado: boolean | null) {
  return cliente.rpc("registrar_pago", {
    p_sesion_id: sessionId, p_pedido_id: null, p_metodo: "CARD", p_monto: soles(monto), p_recibido: null,
    p_referencia: referencia, p_aprobado: aprobado, p_clave: crypto.randomUUID(),
  }).single<{ pago_id: string; estado: string }>();
}

async function pagadoConfirmado() {
  const { data } = await caja!.from("payments").select("amount")
    .eq("table_session_id", sessionId!).eq("status", "CONFIRMED");
  return (data ?? []).reduce((suma, p) => suma + Math.round(Number(p.amount) * 100), 0);
}

beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD en .env.local");
  const sesiones = await Promise.all([
    iniciar("mesero@demo.altoque.pe"), iniciar("caja@demo.altoque.pe"),
    iniciar("cocina@demo.altoque.pe"), iniciar("dueno@polleria.demo"),
  ]);
  [mesero, caja, cocina, duenoPolleria] = sesiones.map((s) => s.cliente);
  meseroId = sesiones[0].usuarioId;
  cajaId = sesiones[1].usuarioId;
  anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: mesas, error: errorMesas }, { data: productos, error: errorProductos }, { data: abiertas, error: errorSesiones }] = await Promise.all([
    mesero.from("dining_tables").select("id, branch_id").eq("restaurant_id", restaurantId).eq("active", true).order("number"),
    mesero.from("products").select("id, price").eq("restaurant_id", restaurantId).eq("active", true).eq("available", true)
      .order("price").limit(1),
    mesero.from("table_sessions").select("dining_table_id").eq("restaurant_id", restaurantId).is("closed_at", null),
  ]);
  if (errorMesas || errorProductos || errorSesiones) throw new Error("No se pudieron consultar los datos demo para la prueba");
  const ocupadas = new Set((abiertas ?? []).map((s) => s.dining_table_id));
  const mesa = (mesas ?? []).find((fila) => !ocupadas.has(fila.id));
  if (!mesa || !productos?.[0]) throw new Error("Se requiere una mesa libre y un producto activo en Cevichería demo");
  totalCentimos = Math.round(Number(productos[0].price) * 100);

  const { data: sesion, error: errorApertura } = await mesero.from("table_sessions").insert({
    restaurant_id: restaurantId, branch_id: mesa.branch_id, dining_table_id: mesa.id, opened_by: meseroId,
  }).select("id").single();
  if (errorApertura || !sesion) throw new Error("No se pudo abrir la sesión de mesa para la prueba");
  sessionId = sesion.id;

  const { data: pedido, error: errorPedido } = await mesero.rpc("registrar_pedido_mesero", {
    p_restaurant_id: restaurantId, p_modality: "DINE_IN", p_dining_table_id: mesa.id,
    p_branch_id: mesa.branch_id, p_idempotency_key: crypto.randomUUID(),
    p_items: [{ productoId: productos[0].id, cantidad: 1, observacion: "Prueba US-022" }],
  }).single();
  if (errorPedido || !pedido) throw new Error("No se pudo crear el pedido demo para la prueba");
  orderId = (pedido as { pedido_id: string }).pedido_id;
}, 30_000);

afterAll(async () => {
  const errores: string[] = [];
  try {
    if (mesero && orderId) {
      // Se cancela para que no quede en cocina; el pago de prueba se conserva como registro.
      const { error } = await mesero.rpc("cambiar_estado_pedido", {
        p_pedido_id: orderId, p_estado: "CANCELLED", p_motivo: "Prueba automática",
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
    await Promise.all([mesero?.auth.signOut(), caja?.auth.signOut(), cocina?.auth.signOut(), duenoPolleria?.auth.signOut()]);
  }
  if (errores.length) throw new Error(errores.join("; "));
}, 30_000);

describe("RPC registrar_pago en efectivo (US-022)", () => {
  it("cocina, otro restaurante y anónimo no pueden cobrar", async () => {
    for (const cliente of [cocina!, duenoPolleria!]) {
      const { error } = await pagarEfectivo(cliente, 100, 100);
      expect(error?.message).toContain("FORBIDDEN");
    }
    const { error } = await pagarEfectivo(anon!, 100, 100);
    expect(error).not.toBeNull();
  });

  it("rechaza efectivo insuficiente y montos mayores al saldo", async () => {
    expect((await pagarEfectivo(caja!, 100, 50)).error?.message).toContain("INSUFFICIENT_CASH");
    expect((await pagarEfectivo(caja!, totalCentimos + 1, totalCentimos + 1)).error?.message).toContain("AMOUNT_EXCEEDS_BALANCE");
  });

  it("registra un pago parcial con vuelto, sin duplicar en el reintento", async () => {
    const clave = crypto.randomUUID();
    const primero = await pagarEfectivo(caja!, 100, 500, clave);
    expect(primero.error).toBeNull();
    expect(primero.data).toMatchObject({ estado: "CONFIRMED" });
    expect(Number(primero.data!.vuelto)).toBe(4);

    const reintento = await pagarEfectivo(caja!, 100, 500, clave);
    expect(reintento.error).toBeNull();
    expect(reintento.data!.pago_id).toBe(primero.data!.pago_id);

    const { data: pagos, error } = await caja!.from("payments")
      .select("id, amount, received_amount, change_amount, status, created_by, confirmed_at")
      .eq("table_session_id", sessionId!);
    expect(error).toBeNull();
    expect(pagos).toHaveLength(1);
    expect(pagos![0]).toMatchObject({ status: "CONFIRMED", created_by: cajaId });
    expect(Number(pagos![0].received_amount)).toBe(5);
    expect(Number(pagos![0].change_amount)).toBe(4);
    expect(pagos![0].confirmed_at).toBeTruthy();
  });

  it("el dueño de otro restaurante no ve los pagos", async () => {
    const { data, error } = await duenoPolleria!.from("payments").select("id").eq("table_session_id", sessionId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("no se puede insertar un pago directo, saltándose la función", async () => {
    const { error } = await caja!.from("payments").insert({
      restaurant_id: restaurantId, table_session_id: sessionId, method: "CASH", status: "CONFIRMED", amount: 1,
      received_amount: 1, change_amount: 0, idempotency_key: crypto.randomUUID(), created_by: cajaId,
      confirmed_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("un Yape queda por verificar y el mesero no puede confirmarlo", async () => {
    const { data, error } = await caja!.rpc("registrar_pago", {
      p_sesion_id: sessionId, p_pedido_id: null, p_metodo: "YAPE", p_monto: "1.00", p_recibido: null,
      p_referencia: "PRUEBA-YAPE-1", p_aprobado: null, p_clave: crypto.randomUUID(),
    }).single<{ pago_id: string; estado: string }>();
    expect(error).toBeNull();
    expect(data!.estado).toBe("PENDING");
    yapeRechazado = data!.pago_id;

    const { error: errorMesero } = await mesero!.rpc("verificar_pago", { p_pago_id: yapeRechazado, p_confirmar: true });
    expect(errorMesero?.message).toContain("FORBIDDEN");
    const { error: errorOtro } = await duenoPolleria!.rpc("verificar_pago", { p_pago_id: yapeRechazado, p_confirmar: true });
    expect(errorOtro?.message).toContain("FORBIDDEN");
  });

  it("un Yape sin referencia no se registra", async () => {
    const { error } = await caja!.rpc("registrar_pago", {
      p_sesion_id: sessionId, p_pedido_id: null, p_metodo: "YAPE", p_monto: "1.00", p_recibido: null,
      p_referencia: null, p_aprobado: null, p_clave: crypto.randomUUID(),
    });
    expect(error?.message).toContain("INVALID_PAYMENT");
  });

  it("caja rechaza un Yape: queda quién y cuándo, y no baja el saldo", async () => {
    const { data, error } = await caja!.rpc("verificar_pago", { p_pago_id: yapeRechazado, p_confirmar: false });
    expect(error).toBeNull();
    expect(data).toBe("FAILED");
    const { data: pago } = await caja!.from("payments").select("status, verified_by, verified_at, confirmed_at")
      .eq("id", yapeRechazado!).single();
    expect(pago).toMatchObject({ status: "FAILED", verified_by: cajaId, confirmed_at: null });
    expect(pago!.verified_at).toBeTruthy();

    const { error: errorDoble } = await caja!.rpc("verificar_pago", { p_pago_id: yapeRechazado, p_confirmar: true });
    expect(errorDoble?.message).toContain("ALREADY_VERIFIED");
  });

  it("caja confirma un Yape y recién ahí cuenta como pagado", async () => {
    const { data } = await caja!.rpc("registrar_pago", {
      p_sesion_id: sessionId, p_pedido_id: null, p_metodo: "YAPE", p_monto: "1.00", p_recibido: null,
      p_referencia: "PRUEBA-YAPE-2", p_aprobado: null, p_clave: crypto.randomUUID(),
    }).single<{ pago_id: string }>();
    const { data: estado, error } = await caja!.rpc("verificar_pago", { p_pago_id: data!.pago_id, p_confirmar: true });
    expect(error).toBeNull();
    expect(estado).toBe("CONFIRMED");

    const { data: confirmados } = await caja!.from("payments").select("amount")
      .eq("table_session_id", sessionId!).eq("status", "CONFIRMED");
    const pagado = (confirmados ?? []).reduce((suma, p) => suma + Math.round(Number(p.amount) * 100), 0);
    expect(pagado).toBe(200); // 1.00 en efectivo + 1.00 Yape confirmado; el rechazado no suma
  });

  it("tarjeta rechazada: queda registrada con quién la anotó, pero no cobra (US-024)", async () => {
    const { data, error } = await pagarTarjeta(caja!, 100, "PRUEBA-POS-1", false);
    expect(error).toBeNull();
    expect(data!.estado).toBe("FAILED");
    const { data: pago } = await caja!.from("payments").select("method, status, reference, created_by, confirmed_at")
      .eq("id", data!.pago_id).single();
    expect(pago).toMatchObject({
      method: "CARD", status: "FAILED", reference: "PRUEBA-POS-1", created_by: cajaId, confirmed_at: null,
    });
    expect(await pagadoConfirmado()).toBe(200); // sigue igual que antes del rechazo
  });

  it("tarjeta aprobada: baja el saldo; un mesero también puede registrarla (US-024)", async () => {
    expect(totalCentimos).toBeGreaterThan(300);
    const { data, error } = await pagarTarjeta(mesero!, 100, "PRUEBA-POS-2", true);
    expect(error).toBeNull();
    expect(data!.estado).toBe("CONFIRMED");
    expect(await pagadoConfirmado()).toBe(300);
  });

  it("tarjeta: exige resultado y nunca guarda un número de tarjeta (US-024)", async () => {
    const sinResultado = await pagarTarjeta(caja!, 100, "PRUEBA-POS-3", null);
    expect(sinResultado.error?.message).toContain("INVALID_PAYMENT");
    // Número de prueba (no es una tarjeta real). Se manda como rechazado: no cobra nada.
    const conNumero = await pagarTarjeta(caja!, 100, "4111111111111111", false);
    expect(conNumero.error?.message).toContain("payments_reference_sin_tarjeta");
    const { data } = await caja!.from("payments").select("id").eq("table_session_id", sessionId!)
      .eq("reference", "4111111111111111");
    expect(data).toEqual([]);
  });

  it("cobrar el resto deja el saldo en cero y ya no acepta más pagos", async () => {
    const resto = totalCentimos - 300;
    const pago = await pagarEfectivo(caja!, resto, resto);
    expect(pago.error).toBeNull();
    expect(Number(pago.data!.vuelto)).toBe(0);
    expect((await pagarEfectivo(caja!, 100, 100)).error?.message).toContain("NOTHING_TO_PAY");
  });
});
