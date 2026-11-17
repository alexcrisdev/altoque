import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const esLocal = (() => {
  if (!url) return false;
  const destino = new URL(url);
  return ["localhost", "127.0.0.1"].includes(destino.hostname);
})();

const restauranteId = "10000000-0000-0000-0000-000000000001";
const localId = "20000000-0000-0000-0000-000000000001";
const mesaId = "30000000-0000-0000-0000-000000000001";
const clientes: SupabaseClient[] = [];
const pedidos: string[] = [];
const pedidosMesa: string[] = [];
const checkouts: string[] = [];
const pagos: { id: string; pedidoId?: string; sesionId?: string }[] = [];
let servicio: SupabaseClient;
let caja: SupabaseClient;
let mesero: SupabaseClient;
let cajaId: string;
let productoId: string | undefined;
let sesionId: string | undefined;
let qrMostradorId: string;
let qrMesaId: string;
let fechaStock: string;

function exigir<T>(respuesta: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (respuesta.error) throw new Error(respuesta.error.message);
  if (respuesta.data == null) throw new Error("La consulta no devolvió datos.");
  return respuesta.data;
}

function cliente(clave: string): SupabaseClient {
  const nuevo = createClient(url!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clientes.push(nuevo);
  return nuevo;
}

function registrarPago(id: string, asociacion: { pedidoId?: string; sesionId?: string }) {
  if (!pagos.some((pago) => pago.id === id)) pagos.push({ id, ...asociacion });
}

async function iniciar(correo: string) {
  const nuevo = cliente(anonKey!);
  const { data, error } = await nuevo.auth.signInWithPassword({ email: correo, password: password! });
  if (error || !data.user) throw new Error(`No se pudo iniciar sesión con ${correo}.`);
  return { cliente: nuevo, id: data.user.id };
}

async function crearPedido(tipo: "CLIENTE" | "QR_ANTIGUO" | "MESA" | "MESERO" | "MESERO_MESA" | "PARA_LLEVAR_DESDE_MESA" = "CLIENTE") {
  const items = [{ productoId: productoId!, cantidad: 1, observacion: "Prueba local US-085" }];
  let respuesta;
  if (tipo === "MESERO" || tipo === "MESERO_MESA") {
    respuesta = await mesero.rpc("registrar_pedido_mesero", {
      p_restaurant_id: restauranteId,
      p_modality: tipo === "MESERO_MESA" ? "DINE_IN" : "TAKEAWAY",
      p_dining_table_id: tipo === "MESERO_MESA" ? mesaId : null,
      p_branch_id: localId, p_idempotency_key: crypto.randomUUID(), p_items: items,
    }).single<{ pedido_id: string }>();
  } else if (tipo === "QR_ANTIGUO") {
    respuesta = await servicio.rpc("registrar_pedido_qr", {
      p_qr_code_id: qrMostradorId, p_idempotency_key: crypto.randomUUID(), p_items: items,
    }).single<{ pedido_id: string }>();
  } else {
    respuesta = await servicio.rpc("registrar_pedido_cliente", {
      p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
      p_qr_code_id: tipo === "MESA" || tipo === "PARA_LLEVAR_DESDE_MESA" ? qrMesaId : qrMostradorId,
      p_idempotency_key: crypto.randomUUID(), p_items: items,
      p_modality: tipo === "MESA" ? "DINE_IN" : "TAKEAWAY",
      p_customer_name: tipo === "MESA" ? null : "Prueba local US-085",
      p_customer_phone: tipo === "MESA" ? null : "999999999",
    }).single<{ pedido_id: string }>();
  }
  const pedido = exigir(respuesta);
  pedidos.push(pedido.pedido_id);
  if (tipo === "MESA" || tipo === "MESERO_MESA") pedidosMesa.push(pedido.pedido_id);
  return pedido.pedido_id;
}

async function estado(id: string) {
  return exigir(await caja.from("orders").select("status, source, modality, table_session_id")
    .eq("restaurant_id", restauranteId).eq("id", id)
    .single<{ status: string; source: string; modality: string; table_session_id: string | null }>());
}

async function historial(id: string) {
  return exigir(await servicio.from("order_status_history")
    .select("from_status, to_status, reason, changed_by")
    .eq("restaurant_id", restauranteId).eq("order_id", id)
    .overrideTypes<{ from_status: string | null; to_status: string; reason: string | null; changed_by: string | null }[], { merge: false }>());
}

async function comprobarIngreso(id: string, autor: string | null = cajaId) {
  expect((await estado(id)).status).toBe("IN_PROGRESS");
  const cambios = (await historial(id)).filter((fila) => fila.reason === "US-085: pago confirmado");
  expect(cambios).toEqual([{
    from_status: "PENDING", to_status: "IN_PROGRESS",
    reason: "US-085: pago confirmado", changed_by: autor,
  }]);
}

async function comprobarIngresoMesa(
  id: string,
  autor: string | null = cajaId,
  motivo = "US-094: pago confirmado",
) {
  expect((await estado(id)).status).toBe("IN_PROGRESS");
  expect((await historial(id)).filter((fila) => fila.reason === motivo)).toEqual([{
    from_status: "PENDING", to_status: "IN_PROGRESS",
    reason: motivo, changed_by: autor,
  }]);
}

async function crearCheckoutStripe(cuenta: { sesionId: string | null; pedidoId: string | null }) {
  const inicio = exigir(await servicio.rpc("iniciar_checkout_stripe", {
    p_sesion_id: cuenta.sesionId,
    p_pedido_id: cuenta.pedidoId,
  }).single<{ checkout_id: string; amount: number; order_ids: string[] }>());
  const sessionId = `cs_test_US085094${crypto.randomUUID().replaceAll("-", "")}`;
  checkouts.push(inicio.checkout_id);
  const vinculado = exigir(await servicio.rpc("vincular_checkout_stripe", {
    p_checkout_id: inicio.checkout_id,
    p_session_id: sessionId,
  }));
  expect(vinculado).toBe(true);
  return { sessionId, amount: Number(inicio.amount), orderIds: inicio.order_ids };
}

async function pagar(
  pedidoId: string,
  metodo: "CASH" | "CARD" | "YAPE" = "CASH",
  centimos = 1000,
  aprobado = true,
  clave = crypto.randomUUID(),
) {
  const monto = (centimos / 100).toFixed(2);
  const pago = exigir(await caja.rpc("registrar_pago", {
    p_sesion_id: null, p_pedido_id: pedidoId, p_metodo: metodo, p_monto: monto,
    p_recibido: metodo === "CASH" ? monto : null,
    p_referencia: metodo === "CASH" ? null : "US085-PRUEBA",
    p_aprobado: metodo === "CARD" ? aprobado : null, p_clave: clave,
  }).single<{ pago_id: string; estado: string }>());
  registrarPago(pago.pago_id, { pedidoId });
  return pago;
}

async function pagarSesion(
  metodo: "CASH" | "CARD" | "YAPE" = "CASH",
  centimos = 1000,
  aprobado = true,
  clave = crypto.randomUUID(),
) {
  const monto = (centimos / 100).toFixed(2);
  const pago = exigir(await caja.rpc("registrar_pago", {
    p_sesion_id: sesionId, p_pedido_id: null, p_metodo: metodo, p_monto: monto,
    p_recibido: metodo === "CASH" ? monto : null,
    p_referencia: metodo === "CASH" ? null : `US094-${crypto.randomUUID().slice(0, 8)}`,
    p_aprobado: metodo === "CARD" ? aprobado : null, p_clave: clave,
  }).single<{ pago_id: string; estado: string }>());
  registrarPago(pago.pago_id, { sesionId });
  return pago;
}

async function vendidos() {
  return exigir(await servicio.from("product_daily_stock").select("sold")
    .eq("restaurant_id", restauranteId).eq("product_id", productoId!)
    .eq("stock_date", fechaStock).single<{ sold: number }>()).sold;
}

async function limpiarPedidosDePrueba() {
  if (!servicio) return;
  const ids = [...new Set(pedidos)];
  if (pagos.length) {
    const resultadoPagos = await servicio.from("payments").delete().in("id", pagos.map((pago) => pago.id));
    if (resultadoPagos.error) throw new Error(resultadoPagos.error.message);
    pagos.splice(0);
  }
  if (checkouts.length) {
    const resultadoCheckouts = await servicio.from("stripe_checkout_attempts").delete().in("id", checkouts);
    if (resultadoCheckouts.error) throw new Error(resultadoCheckouts.error.message);
    checkouts.splice(0);
  }
  if (ids.length) {
    const resultadoPedidos = await servicio.from("orders").delete().in("id", ids);
    if (resultadoPedidos.error) throw new Error(resultadoPedidos.error.message);
  }
  for (const id of ids) {
    const indice = pedidos.indexOf(id);
    if (indice >= 0) pedidos.splice(indice, 1);
    const indiceMesa = pedidosMesa.indexOf(id);
    if (indiceMesa >= 0) pedidosMesa.splice(indiceMesa, 1);
  }
}

// Esta suite nunca prepara datos ni se autentica en una base remota.
describe.skipIf(!esLocal)("US-085: pedidos QR para llevar esperan pago (solo local)", () => {
  beforeAll(async () => {
    if (!anonKey || !serviceKey || !password) throw new Error("Faltan las variables del Supabase local.");
    servicio = cliente(serviceKey);
    const [usuarioCaja, usuarioMesero] = await Promise.all([
      iniciar("caja@demo.altoque.pe"), iniciar("mesero@demo.altoque.pe"),
    ]);
    caja = usuarioCaja.cliente;
    cajaId = usuarioCaja.id;
    mesero = usuarioMesero.cliente;

    qrMostradorId = exigir(await servicio.from("qr_codes").select("id")
      .eq("restaurant_id", restauranteId).eq("branch_id", localId)
      .eq("purpose", "TAKEAWAY").eq("active", true).limit(1).single<{ id: string }>()).id;
    qrMesaId = exigir(await servicio.from("qr_codes").select("id")
      .eq("restaurant_id", restauranteId).eq("dining_table_id", mesaId)
      .eq("active", true).limit(1).single<{ id: string }>()).id;

    // Producto propio: las pruebas no cambian el stock de los productos del seed.
    productoId = exigir(await servicio.from("products").insert({
      restaurant_id: restauranteId,
      category_id: "40000000-0000-0000-0000-000000000001",
      name: `Prueba US-085 ${crypto.randomUUID().slice(0, 8)}`,
      price: 10, active: true, available: true,
    }).select("id").single<{ id: string }>()).id;
    fechaStock = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const stock = await servicio.from("product_daily_stock").insert({
      restaurant_id: restauranteId, product_id: productoId,
      stock_date: fechaStock, quantity: 100, sold: 0,
    });
    if (stock.error) throw new Error(stock.error.message);

    sesionId = exigir(await mesero.from("table_sessions").insert({
      restaurant_id: restauranteId, branch_id: localId,
      dining_table_id: mesaId, opened_by: usuarioMesero.id,
    }).select("id").single<{ id: string }>()).id;
  }, 30_000);

  afterAll(async () => {
    const errores: string[] = [];
    const comprobar = (error: { message: string } | null) => {
      if (error) errores.push(error.message);
    };
    try {
      if (servicio) {
        if (pagos.length) {
          comprobar((await servicio.from("payments").delete().in("id", pagos.map((pago) => pago.id))).error);
        }
        if (checkouts.length) {
          comprobar((await servicio.from("stripe_checkout_attempts").delete().in("id", checkouts)).error);
        }
        if (pedidos.length) {
          comprobar((await servicio.from("orders").delete().in("id", pedidos)).error);
        }
        if (sesionId) comprobar((await servicio.from("table_sessions").delete().eq("id", sesionId)).error);
        if (productoId) {
          comprobar((await servicio.from("product_daily_stock").delete().eq("product_id", productoId)).error);
          comprobar((await servicio.from("products").delete().eq("id", productoId)).error);
        }
      }
    } finally {
      await Promise.all(clientes.map((actual) => actual.auth.signOut()));
    }
    if (errores.length) throw new Error(`Limpieza US-085: ${errores.join("; ")}`);
  }, 30_000);

  afterEach(async () => {
    await limpiarPedidosDePrueba();
  }, 30_000);

  it("QR para llevar nace PENDING y su historial inicial también", async () => {
    const id = await crearPedido();
    expect(await estado(id)).toMatchObject({ status: "PENDING", source: "QR", modality: "TAKEAWAY" });
    expect(await historial(id)).toEqual([{
      from_status: null, to_status: "PENDING", reason: null, changed_by: null,
    }]);
  });

  it("la función antigua registrar_pedido_qr también conserva el estado inicial PENDING", async () => {
    const id = await crearPedido("QR_ANTIGUO");
    expect((await estado(id)).status).toBe("PENDING");
    expect((await historial(id)).map((fila) => fila.to_status)).toEqual(["PENDING"]);
  });

  it("para llevar desde un QR de mesa espera pago en su propia cuenta", async () => {
    const id = await crearPedido("PARA_LLEVAR_DESDE_MESA");
    expect(await estado(id)).toMatchObject({
      status: "PENDING", source: "QR", modality: "TAKEAWAY", table_session_id: null,
    });
    await pagar(id);
    await comprobarIngreso(id);
  });

  it("efectivo completo lo inicia y el reintento no duplica el historial", async () => {
    const id = await crearPedido();
    const clave = crypto.randomUUID();
    const primero = await pagar(id, "CASH", 1000, true, clave);
    expect(primero.estado).toBe("CONFIRMED");
    await comprobarIngreso(id);
    expect((await pagar(id, "CASH", 1000, true, clave)).pago_id).toBe(primero.pago_id);
    await comprobarIngreso(id);
    expect(await historial(id)).toHaveLength(2);
  });

  it("un pago parcial no lo inicia; completar el saldo sí", async () => {
    const id = await crearPedido();
    await pagar(id, "CASH", 400);
    expect((await estado(id)).status).toBe("PENDING");
    expect(await historial(id)).toHaveLength(1);
    await pagar(id, "CASH", 600);
    await comprobarIngreso(id);
  });

  it("Yape pendiente no lo inicia y verificarlo sí", async () => {
    const id = await crearPedido();
    const pago = await pagar(id, "YAPE");
    expect(pago.estado).toBe("PENDING");
    expect((await estado(id)).status).toBe("PENDING");
    expect(await historial(id)).toHaveLength(1);
    exigir(await caja.rpc("verificar_pago", { p_pago_id: pago.pago_id, p_confirmar: true }));
    await comprobarIngreso(id);
  });

  it("rechazar Yape no lo envía a cocina", async () => {
    const id = await crearPedido();
    const pago = await pagar(id, "YAPE");
    exigir(await caja.rpc("verificar_pago", { p_pago_id: pago.pago_id, p_confirmar: false }));
    expect((await estado(id)).status).toBe("PENDING");
    expect(await historial(id)).toHaveLength(1);
  });

  it("tarjeta rechazada no lo inicia; tarjeta aprobada sí", async () => {
    const id = await crearPedido();
    expect((await pagar(id, "CARD", 1000, false)).estado).toBe("FAILED");
    expect((await estado(id)).status).toBe("PENDING");
    expect((await pagar(id, "CARD")).estado).toBe("CONFIRMED");
    await comprobarIngreso(id);
  });

  it("la RPC de Stripe lo inicia una sola vez y registra autor nulo", async () => {
    const id = await crearPedido();
    const checkout = await crearCheckoutStripe({ sesionId: null, pedidoId: id });
    const parametros = {
      p_stripe_session_id: checkout.sessionId,
      p_payment_intent: `pi_US085${crypto.randomUUID().replaceAll("-", "x")}`,
      p_sesion_id: null, p_pedido_id: id, p_monto: checkout.amount.toFixed(2),
    };
    const primero = exigir(await servicio.rpc("registrar_pago_stripe", parametros)
      .single<{ pago_id: string; duplicado: boolean }>());
    registrarPago(primero.pago_id, { pedidoId: id });
    expect(primero.duplicado).toBe(false);
    await comprobarIngreso(id, null);
    const repetido = exigir(await servicio.rpc("registrar_pago_stripe", parametros)
      .single<{ pago_id: string; duplicado: boolean }>());
    expect(repetido).toEqual({ pago_id: primero.pago_id, duplicado: true });
    expect(await historial(id)).toHaveLength(2);
  });

  it("pago previo obligatorio: el pedido QR en mesa nace esperando pago sin configurar nada", async () => {
    const id = await crearPedido("MESA");
    expect(await estado(id)).toMatchObject({ status: "PENDING", modality: "DINE_IN", table_session_id: sesionId });
    expect((await historial(id)).map((fila) => fila.to_status)).toEqual(["PENDING"]);
  });

  it("US-094: el QR de mesa nace esperando pago; el pago parcial no lo libera y el total sí", async () => {
    const id = await crearPedido("MESA");
    expect(await estado(id)).toMatchObject({ status: "PENDING", modality: "DINE_IN", table_session_id: sesionId });
    expect((await historial(id)).map((fila) => fila.to_status)).toEqual(["PENDING"]);

    await pagarSesion("CASH", 400);
    expect((await estado(id)).status).toBe("PENDING");
    expect(await historial(id)).toHaveLength(1);

    await pagarSesion("CASH", 600);
    await comprobarIngresoMesa(id);
  });

  it("US-094: todos los pendientes de la sesión entran al pagar; un pedido posterior vuelve a esperar", async () => {
    const primero = await crearPedido("MESA");
    const segundo = await crearPedido("MESA");
    await pagarSesion("CASH", 2000);
    await comprobarIngresoMesa(primero);
    await comprobarIngresoMesa(segundo);

    const tercero = await crearPedido("MESA");
    expect((await estado(tercero)).status).toBe("PENDING");
    await pagarSesion("CASH", 1000);
    await comprobarIngresoMesa(tercero);
  });

  it.each(["CARD", "YAPE"] as const)("US-094: el pago de mesa por %s inicia al quedar confirmado", async (metodo) => {
    const id = await crearPedido("MESA");
    const pago = await pagarSesion(metodo);
    if (metodo === "YAPE") {
      expect(pago.estado).toBe("PENDING");
      expect((await estado(id)).status).toBe("PENDING");
      exigir(await caja.rpc("verificar_pago", { p_pago_id: pago.pago_id, p_confirmar: true }));
    } else {
      expect(pago.estado).toBe("CONFIRMED");
    }
    await comprobarIngresoMesa(id);
  });

  it("US-094: Stripe registra pago de sesión y libera sus pedidos con autor nulo", async () => {
    const id = await crearPedido("MESA");
    const checkout = await crearCheckoutStripe({ sesionId: sesionId!, pedidoId: null });
    expect(checkout.orderIds).toContain(id);
    const pago = exigir(await servicio.rpc("registrar_pago_stripe", {
      p_stripe_session_id: checkout.sessionId,
      // Separadores alfabéticos evitan 13 dígitos seguidos en IDs ficticios.
      p_payment_intent: `pi_US094${crypto.randomUUID().replaceAll("-", "x")}`,
      p_sesion_id: sesionId, p_pedido_id: null, p_monto: checkout.amount.toFixed(2),
    }).single<{ pago_id: string; duplicado: boolean }>());
    registrarPago(pago.pago_id, { sesionId });
    await comprobarIngresoMesa(id, null, "US-097: pago Checkout");
  });

  it("US-094: los pedidos tomados por el mesero no esperan aunque el ajuste esté activo", async () => {
    const id = await crearPedido("MESERO_MESA");
    expect(await estado(id)).toMatchObject({ status: "IN_PROGRESS", source: "WAITER", modality: "DINE_IN" });
  });

  it("US-094: dos pagos parciales simultáneos solo crean una transición a cocina", async () => {
    const id = await crearPedido("MESA");
    await Promise.all([pagarSesion("CASH", 500), pagarSesion("CASH", 500)]);
    await comprobarIngresoMesa(id);
    expect((await historial(id)).filter((fila) => fila.reason === "US-094: pago confirmado")).toHaveLength(1);
  });

  it("pago previo obligatorio: el ajuste ya no se puede apagar", async () => {
    const { error } = await servicio.from("restaurants")
      .update({ prepay_dine_in: false }).eq("id", restauranteId);
    expect(error?.code).toBe("23514");
    const restaurante = exigir(await servicio.from("restaurants")
      .select("prepay_dine_in").eq("id", restauranteId)
      .single<{ prepay_dine_in: boolean }>());
    expect(restaurante.prepay_dine_in).toBe(true);
  });

  it("el pedido para llevar del mesero sigue naciendo IN_PROGRESS", async () => {
    const id = await crearPedido("MESERO");
    expect(await estado(id)).toMatchObject({ status: "IN_PROGRESS", source: "WAITER" });
    await pagar(id);
    expect(await historial(id)).toHaveLength(1);
  });

  it("cancelar PENDING devuelve exactamente el stock reservado", async () => {
    const antes = await vendidos();
    const id = await crearPedido();
    expect(await vendidos()).toBe(antes + 1);
    const linea = exigir(await servicio.from("order_items").select("stock_reserved")
      .eq("order_id", id).single<{ stock_reserved: boolean }>());
    expect(linea.stock_reserved).toBe(true);
    exigir(await mesero.rpc("cambiar_estado_pedido", {
      p_pedido_id: id, p_estado: "CANCELLED", p_motivo: "Prueba local US-085",
    }));
    expect((await estado(id)).status).toBe("CANCELLED");
    expect(await vendidos()).toBe(antes);
  });

  it("no permite enviar manualmente un PENDING a preparación", async () => {
    const id = await crearPedido();
    const { error } = await mesero.rpc("cambiar_estado_pedido", {
      p_pedido_id: id, p_estado: "IN_PROGRESS", p_motivo: null,
    });
    expect(error?.message).toContain("INVALID_TRANSITION");
    expect((await estado(id)).status).toBe("PENDING");
  });

  it("dos pagos parciales concurrentes generan una sola entrada a preparación", async () => {
    const id = await crearPedido();
    await Promise.all([pagar(id, "CASH", 500), pagar(id, "CASH", 500)]);
    await comprobarIngreso(id);
    expect(await historial(id)).toHaveLength(2);
  });
});
