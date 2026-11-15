import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const local = (() => {
  if (!url) return false;
  return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
})();

const restauranteId = "10000000-0000-0000-0000-000000000001";
const pedidos: string[] = [];
const pagos: string[] = [];
const checkouts: string[] = [];
let servicio: SupabaseClient;
let ramaId: string;
let ramaLegadoId: string;
let qrId: string;
let qrLegadoId: string;
let qrMesaId: string;
let mesaId: string;
let sesionMesaId: string;
let usuarioId: string;
let productoId: string;
let categoriaId: string;
let fechaStock: string;

function exigir<T>(resultado: { data: T | null; error: { message: string } | null }): T {
  if (resultado.error) throw new Error(resultado.error.message);
  if (resultado.data === null) throw new Error("La consulta no devolvió datos.");
  return resultado.data;
}

async function crearPedido(clave = crypto.randomUUID(), qrCodeId = qrId) {
  const resultado = await servicio.rpc("registrar_pedido_cliente", {
    p_qr_code_id: qrCodeId,
    p_idempotency_key: clave,
    p_items: [{ productoId, cantidad: 1, observacion: "Prueba local US-097" }],
    p_modality: "TAKEAWAY",
    p_customer_name: "Prueba US-097",
    p_customer_phone: null,
    p_alergia_respuesta: "NONE",
    p_alergenos: [],
    p_alergia_detalle: null,
  }).single<{ pedido_id: string }>();
  if (resultado.error) throw new Error(resultado.error.message);
  if (!resultado.data?.pedido_id) throw new Error("El RPC no creó un pedido: pedido_id vacío.");
  const pedido = resultado.data;
  pedidos.push(pedido.pedido_id);
  return pedido.pedido_id;
}

async function crearPedidoMesa(clave = crypto.randomUUID()) {
  const resultado = await servicio.rpc("registrar_pedido_cliente", {
    p_qr_code_id: qrMesaId,
    p_idempotency_key: clave,
    p_items: [{ productoId, cantidad: 1, observacion: "Prueba Checkout snapshot US-097" }],
    p_modality: "DINE_IN",
    p_customer_name: null,
    p_customer_phone: null,
    p_alergia_respuesta: "NONE",
    p_alergenos: [],
    p_alergia_detalle: null,
  }).single<{ pedido_id: string }>();
  const pedido = exigir(resultado).pedido_id;
  pedidos.push(pedido);
  exigir(await servicio.from("orders").update({ status: "PENDING" }).eq("id", pedido).select("id").single());
  return pedido;
}

describe.skipIf(!local || !anonKey || !serviceKey)("US-097 · vencimiento RLS local", () => {
  beforeAll(async () => {
    servicio = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const rama = exigir(await servicio.from("branches").insert({
      restaurant_id: restauranteId,
      name: `Pruebas US-097 ${crypto.randomUUID().slice(0, 8)}`,
      active: true,
    }).select("id").single<{ id: string }>());
    ramaId = rama.id;
    ramaLegadoId = exigir(await servicio.from("branches").insert({
      restaurant_id: restauranteId,
      name: `Pruebas US-097 histórico ${crypto.randomUUID().slice(0, 8)}`,
      active: true,
    }).select("id").single<{ id: string }>()).id;

    usuarioId = exigir(await servicio.from("users").select("id").limit(1).single<{ id: string }>()).id;
    mesaId = exigir(await servicio.from("dining_tables").insert({
      restaurant_id: restauranteId, branch_id: ramaId, number: 10000 + Math.floor(Math.random() * 10000), active: true,
    }).select("id").single<{ id: string }>()).id;
    sesionMesaId = exigir(await servicio.from("table_sessions").insert({
      restaurant_id: restauranteId, branch_id: ramaId, dining_table_id: mesaId, opened_by: usuarioId,
    }).select("id").single<{ id: string }>()).id;

    categoriaId = exigir(await servicio.from("categories").select("id")
      .eq("restaurant_id", restauranteId).limit(1).single<{ id: string }>()).id;
    productoId = exigir(await servicio.from("products").insert({
      restaurant_id: restauranteId, category_id: categoriaId,
      name: `Prueba US-097 ${crypto.randomUUID().slice(0, 8)}`,
      price: 1, active: true, available: true,
    }).select("id").single<{ id: string }>()).id;

    fechaStock = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    exigir(await servicio.from("product_daily_stock").insert({
      restaurant_id: restauranteId, product_id: productoId, stock_date: fechaStock, quantity: 10, sold: 0,
    }).select("id").single<{ id: string }>());

    const qr = exigir(await servicio.from("qr_codes").insert({
      restaurant_id: restauranteId, branch_id: ramaId, purpose: "TAKEAWAY",
      token_hash: (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "").toLowerCase(),
    }).select("id").single<{ id: string }>());
    qrId = qr.id;
    const qrMesa = exigir(await servicio.from("qr_codes").insert({
      restaurant_id: restauranteId, branch_id: ramaId, dining_table_id: mesaId, purpose: "DINE_IN",
      token_hash: (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "").toLowerCase().slice(0, 64),
    }).select("id").single<{ id: string }>());
    qrMesaId = qrMesa.id;
    const qrLegado = exigir(await servicio.from("qr_codes").insert({
      restaurant_id: restauranteId, branch_id: ramaLegadoId, purpose: "TAKEAWAY",
      token_hash: (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "").toLowerCase().slice(0, 64),
    }).select("id").single<{ id: string }>());
    qrLegadoId = qrLegado.id;
  }, 30_000);

  afterAll(async () => {
    const errores: string[] = [];
    const anotar = (error: { message: string } | null) => { if (error) errores.push(error.message); };
    try {
      if (servicio) {
        if (pagos.length) anotar((await servicio.from("payments").delete().in("id", pagos)).error);
        if (pedidos.length) anotar((await servicio.from("payments").delete().in("order_id", pedidos)).error);
        if (pedidos.length) anotar((await servicio.from("order_items").delete().in("order_id", pedidos)).error);
        if (pedidos.length) anotar((await servicio.from("orders").delete().in("id", pedidos)).error);
        if (productoId) anotar((await servicio.from("product_daily_stock").delete().eq("product_id", productoId)).error);
        if (productoId) anotar((await servicio.from("products").delete().eq("id", productoId)).error);
        if (qrId) anotar((await servicio.from("qr_codes").delete().eq("id", qrId)).error);
        if (qrLegadoId) anotar((await servicio.from("qr_codes").delete().eq("id", qrLegadoId)).error);
        if (qrMesaId) anotar((await servicio.from("qr_codes").delete().eq("id", qrMesaId)).error);
        if (sesionMesaId) anotar((await servicio.from("table_sessions").delete().eq("id", sesionMesaId)).error);
        if (mesaId) anotar((await servicio.from("dining_tables").delete().eq("id", mesaId)).error);
        if (ramaLegadoId) anotar((await servicio.from("branches").delete().eq("id", ramaLegadoId)).error);
        if (ramaId) anotar((await servicio.from("branches").delete().eq("id", ramaId)).error);
      }
    } finally {
      await servicio?.auth.signOut();
    }
    if (errores.length) throw new Error(`Limpieza US-097: ${errores.join("; ")}`);
  }, 30_000);

  afterEach(async () => {
    if (!servicio) return;
    if (checkouts.length) {
      const resultado = await servicio.from("stripe_checkout_attempts").delete().in("id", checkouts.splice(0));
      if (resultado.error) throw new Error(resultado.error.message);
    }
    if (pedidos.length) {
      const pagosDelCaso = await servicio.from("payments").delete().in("order_id", pedidos);
      if (pagosDelCaso.error) throw new Error(pagosDelCaso.error.message);
      const itemsDelCaso = await servicio.from("order_items").delete().in("order_id", pedidos);
      if (itemsDelCaso.error) throw new Error(itemsDelCaso.error.message);
    }
    if (pagos.length) {
      const resultado = await servicio.from("payments").delete().in("id", pagos.splice(0));
      if (resultado.error) throw new Error(resultado.error.message);
    }
    if (pedidos.length) {
      const resultado = await servicio.from("orders").delete().in("id", pedidos.splice(0));
      if (resultado.error) throw new Error(resultado.error.message);
    }
  });

  it("vence un pedido de 16 minutos, registra el motivo y devuelve el stock", async () => {
    const id = await crearPedido();
    const antes = exigir(await servicio.from("product_daily_stock").select("sold")
      .eq("product_id", productoId).eq("stock_date", fechaStock).single<{ sold: number }>()).sold;
    expect(antes).toBe(1);

    const fechaAntigua = new Date(Date.now() - 16 * 60_000).toISOString();
    exigir(await servicio.from("orders").update({ created_at: fechaAntigua }).eq("id", id).select("id").single());
    exigir(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restauranteId }));

    expect(exigir(await servicio.from("orders").select("status").eq("id", id)
      .single<{ status: string }>()).status).toBe("CANCELLED");
    expect(exigir(await servicio.from("order_status_history").select("from_status, to_status, changed_by, reason")
      .eq("order_id", id).eq("to_status", "CANCELLED").single<{
        from_status: string; to_status: string; changed_by: string | null; reason: string;
      }>())).toEqual({ from_status: "PENDING", to_status: "CANCELLED", changed_by: null, reason: "Vencido sin pago" });
    expect(exigir(await servicio.from("product_daily_stock").select("sold")
      .eq("product_id", productoId).eq("stock_date", fechaStock).single<{ sold: number }>()).sold).toBe(0);
  });

  it("no vence un pedido que tiene un pago Yape por verificar", async () => {
    const id = await crearPedido();
    const usuarioId = exigir(await servicio.from("users").select("id").limit(1).single<{ id: string }>()).id;
    const pago = exigir(await servicio.from("payments").insert({
      restaurant_id: restauranteId, order_id: id, method: "YAPE", status: "PENDING", amount: 1,
      reference: `US097-${crypto.randomUUID().slice(0, 8)}`,
      idempotency_key: crypto.randomUUID(), created_by: usuarioId,
    }).select("id").single<{ id: string }>());
    pagos.push(pago.id);
    exigir(await servicio.from("orders").update({ created_at: new Date(Date.now() - 16 * 60_000).toISOString() })
      .eq("id", id).select("id").single());

    exigir(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restauranteId }));
    expect(exigir(await servicio.from("orders").select("status").eq("id", id)
      .single<{ status: string }>()).status).toBe("PENDING");
  });

  it("confirma dos vencimientos, su historial y la devolución de stock aunque rechace el nuevo intento", async () => {
    // Simular dos pedidos antiguos que ya existían antes del límite estricto
    // de dos pendientes por QR: se crean bajo otro QR y se reasignan como
    // datos históricos, sin pasar de dos pedidos durante el registro.
    const primero = await crearPedido(crypto.randomUUID(), qrLegadoId);
    const segundo = await crearPedido(crypto.randomUUID(), qrLegadoId);
    await crearPedido();
    await crearPedido();
    const reasignados = exigir(await servicio.from("orders").update({
      qr_code_id: qrId,
      created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
    }).in("id", [primero, segundo]).select("id").order("id"));
    expect(reasignados).toHaveLength(2);

    const claveRechazada = crypto.randomUUID();
    const tercero = await servicio.rpc("registrar_pedido_cliente", {
      p_qr_code_id: qrId, p_idempotency_key: claveRechazada,
      p_items: [{ productoId, cantidad: 1, observacion: null }],
      p_modality: "TAKEAWAY", p_customer_name: "Prueba US-097", p_customer_phone: null,
      p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
    }).single();
    expect(tercero.error).toBeNull();
    expect(tercero.data).toMatchObject({ pedido_id: null, numero_pedido: null });
    for (const id of [primero, segundo]) {
      expect(exigir(await servicio.from("orders").select("status").eq("id", id)
        .single<{ status: string }>()).status).toBe("CANCELLED");
      const historial = await servicio.from("order_status_history").select("id", { count: "exact" })
        .eq("order_id", id).eq("to_status", "CANCELLED");
      expect(historial.error).toBeNull();
      expect(historial.count).toBe(1);
    }
    expect(exigir(await servicio.from("product_daily_stock").select("sold").eq("product_id", productoId)
      .eq("stock_date", fechaStock).single<{ sold: number }>()).sold).toBe(2);
    expect(exigir(await servicio.from("orders").select("id", { count: "exact" })
      .eq("qr_code_id", qrId)).length).toBe(4);
    expect(exigir(await servicio.from("orders").select("id", { count: "exact" })
      .eq("idempotency_key", claveRechazada)).length).toBe(0);
  });

  it("mantiene el límite de dos pedidos y rechaza un tercero sin insertarlo", async () => {
    const primero = await crearPedido();
    const segundo = await crearPedido();
    const tercero = await servicio.rpc("registrar_pedido_cliente", {
      p_qr_code_id: qrId, p_idempotency_key: crypto.randomUUID(),
      p_items: [{ productoId, cantidad: 1, observacion: null }],
      p_modality: "TAKEAWAY", p_customer_name: "Prueba US-097", p_customer_phone: null,
      p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
    }).single();
    expect(tercero.error).toBeNull();
    expect(tercero.data).toMatchObject({ pedido_id: null, numero_pedido: null });
    expect(exigir(await servicio.from("orders").select("id", { count: "exact" })
      .in("id", [primero, segundo])).length).toBe(2);
  });

  it("distingue un reintento idempotente del rechazo por límite en el RPC QR antiguo", async () => {
    const claveUno = crypto.randomUUID();
    const claveDos = crypto.randomUUID();
    const registrarAntiguo = (clave: string) => servicio.rpc("registrar_pedido_qr", {
      p_qr_code_id: qrId,
      p_idempotency_key: clave,
      p_items: [{ productoId, cantidad: 1, observacion: null }],
    }).single<{ pedido_id: string | null; numero_pedido: number | null; repetido: boolean }>();

    const primero = exigir(await registrarAntiguo(claveUno));
    const segundo = exigir(await registrarAntiguo(claveDos));
    expect(primero.pedido_id).toBeTruthy();
    expect(primero.repetido).toBe(false);
    expect(segundo.pedido_id).toBeTruthy();
    expect(segundo.repetido).toBe(false);
    pedidos.push(primero.pedido_id!, segundo.pedido_id!);

    const reintento = exigir(await registrarAntiguo(claveUno));
    expect(reintento.pedido_id).toBe(primero.pedido_id);
    expect(reintento.repetido).toBe(true);

    const rechazado = exigir(await registrarAntiguo(crypto.randomUUID()));
    expect(rechazado).toEqual({ pedido_id: null, numero_pedido: null, repetido: false });
    expect(exigir(await servicio.from("orders").select("id", { count: "exact" })
      .eq("qr_code_id", qrId).eq("status", "PENDING")).length).toBe(2);
  });

  it("serializa solicitudes simultáneas y no permite superar dos pendientes", async () => {
    const resultados = await Promise.all([1, 2, 3].map(() => servicio.rpc("registrar_pedido_cliente", {
      p_qr_code_id: qrId, p_idempotency_key: crypto.randomUUID(),
      p_items: [{ productoId, cantidad: 1, observacion: null }],
      p_modality: "TAKEAWAY", p_customer_name: "Prueba US-097", p_customer_phone: null,
      p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
    }).single<{ pedido_id: string | null; numero_pedido: number | null; repetido: boolean }>()));
    for (const resultado of resultados) if (resultado.error) throw new Error(resultado.error.message);
    const ids = resultados.flatMap(resultado => resultado.data?.pedido_id ? [resultado.data.pedido_id] : []);
    pedidos.push(...ids);
    expect(ids).toHaveLength(2);
    expect(exigir(await servicio.from("orders").select("id", { count: "exact" })
      .eq("qr_code_id", qrId).eq("status", "PENDING")).length).toBe(2);
  });

  it("captura un snapshot durable y deja que el Checkout activo coordine el vencimiento", async () => {
    const pedido = await crearPedido();
    const inicio = exigir(await servicio.rpc("iniciar_checkout_stripe", {
      p_sesion_id: null, p_pedido_id: pedido,
    }).single<{ checkout_id: string; amount: number; order_ids: string[]; expires_at: string }>());
    checkouts.push(inicio.checkout_id);
    expect(inicio.order_ids).toEqual([pedido]);
    expect(Number(inicio.amount)).toBe(1);

    const sesion = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    exigir(await servicio.rpc("vincular_checkout_stripe", { p_checkout_id: inicio.checkout_id, p_session_id: sesion }));
    const antiguo = new Date(Date.now() - 16 * 60_000).toISOString();
    exigir(await servicio.from("orders").update({ created_at: antiguo }).eq("id", pedido).select("id").single());
    exigir(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restauranteId }));
    expect(exigir(await servicio.from("orders").select("status").eq("id", pedido)
      .single<{ status: string }>()).status).toBe("PENDING");

    const pago = exigir(await servicio.rpc("registrar_pago_stripe", {
      p_stripe_session_id: sesion,
      p_payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
      p_sesion_id: null, p_pedido_id: pedido, p_monto: 1,
    }).single<{ pago_id: string; duplicado: boolean }>());
    pagos.push(pago.pago_id);
    expect(pago.duplicado).toBe(false);
  });

  it("dos webhooks simultáneos del mismo Checkout devuelven un solo pago idempotente", async () => {
    const pedido = await crearPedido();
    const inicio = exigir(await servicio.rpc("iniciar_checkout_stripe", {
      p_sesion_id: null, p_pedido_id: pedido,
    }).single<{ checkout_id: string }>());
    checkouts.push(inicio.checkout_id);
    const sesion = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const intento = `pi_${crypto.randomUUID().replaceAll("-", "")}`;
    exigir(await servicio.rpc("vincular_checkout_stripe", { p_checkout_id: inicio.checkout_id, p_session_id: sesion }));
    const resultados = await Promise.all([1, 2].map(() => servicio.rpc("registrar_pago_stripe", {
      p_stripe_session_id: sesion, p_payment_intent: intento,
      p_sesion_id: null, p_pedido_id: pedido, p_monto: 1,
    })));
    for (const resultado of resultados) if (resultado.error) throw new Error(resultado.error.message);
    const ids = resultados.map(resultado => (resultado.data as Array<{ pago_id: string }>)[0]?.pago_id);
    expect(ids[0]).toBe(ids[1]);
    pagos.push(ids[0]!);
    const conteo = await servicio.from("payments").select("id", { count: "exact", head: true })
      .eq("stripe_session_id", sesion);
    if (conteo.error) throw new Error(conteo.error.message);
    expect(conteo.count).toBe(1);
  });

  it("una orden vencida antes de iniciar Checkout se cancela y devuelve stock", async () => {
    const pedido = await crearPedido();
    exigir(await servicio.from("orders").update({
      created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
    }).eq("id", pedido).select("id").single());
    const checkout = await servicio.rpc("iniciar_checkout_stripe", { p_sesion_id: null, p_pedido_id: pedido });
    expect(checkout.error).toBeNull();
    expect(checkout.data).toEqual([]);
    expect(exigir(await servicio.from("orders").select("status").eq("id", pedido)
      .single<{ status: string }>()).status).toBe("CANCELLED");
    expect(exigir(await servicio.from("product_daily_stock").select("sold").eq("product_id", productoId)
      .eq("stock_date", fechaStock).single<{ sold: number }>()).sold).toBe(0);
  });

  it("vence un pedido antiguo y crea Checkout con los pedidos vigentes de la sesión", async () => {
    const vencido = await crearPedidoMesa();
    const vigente = await crearPedidoMesa();
    exigir(await servicio.from("orders").update({
      created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
    }).eq("id", vencido).select("id").single());

    const checkout = exigir(await servicio.rpc("iniciar_checkout_stripe", {
      p_sesion_id: sesionMesaId, p_pedido_id: null,
    }).single<{ checkout_id: string; amount: number; order_ids: string[] }>());
    checkouts.push(checkout.checkout_id);
    expect(checkout.order_ids).toEqual([vigente]);
    expect(Number(checkout.amount)).toBe(1);
    expect(exigir(await servicio.from("orders").select("status").eq("id", vencido)
      .single<{ status: string }>()).status).toBe("CANCELLED");
    expect(exigir(await servicio.from("product_daily_stock").select("sold").eq("product_id", productoId)
      .eq("stock_date", fechaStock).single<{ sold: number }>()).sold).toBe(1);
  });

  it("un Checkout antiguo de mesa solo conserva los pedidos de su snapshot", async () => {
    const original = await crearPedidoMesa();
    const inicio = exigir(await servicio.rpc("iniciar_checkout_stripe", {
      p_sesion_id: sesionMesaId, p_pedido_id: null,
    }).single<{ checkout_id: string; amount: number; order_ids: string[] }>());
    checkouts.push(inicio.checkout_id);
    expect(inicio.order_ids).toEqual([original]);

    const posterior = await crearPedidoMesa();
    const sesionStripe = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    exigir(await servicio.rpc("vincular_checkout_stripe", {
      p_checkout_id: inicio.checkout_id, p_session_id: sesionStripe,
    }));
    const antiguo = new Date(Date.now() - 16 * 60_000).toISOString();
    exigir(await servicio.from("orders").update({ created_at: antiguo }).in("id", [original, posterior])
      .select("id").order("id"));
    exigir(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restauranteId }));
    const estadoOriginal = exigir(await servicio.from("orders").select("status").eq("id", original)
      .single<{ status: string }>()).status;
    const estadoPosterior = exigir(await servicio.from("orders").select("status").eq("id", posterior)
      .single<{ status: string }>()).status;
    expect(estadoOriginal).toBe("PENDING");
    expect(estadoPosterior).toBe("CANCELLED");

    const pago = exigir(await servicio.rpc("registrar_pago_stripe", {
      p_stripe_session_id: sesionStripe,
      p_payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
      p_sesion_id: sesionMesaId, p_pedido_id: null, p_monto: inicio.amount,
    }).single<{ pago_id: string }>()).pago_id;
    pagos.push(pago);
    expect(exigir(await servicio.from("orders").select("status").eq("id", original)
      .single<{ status: string }>()).status).toBe("IN_PROGRESS");
    expect(exigir(await servicio.from("orders").select("status").eq("id", posterior)
      .single<{ status: string }>()).status).toBe("CANCELLED");
  });
});
