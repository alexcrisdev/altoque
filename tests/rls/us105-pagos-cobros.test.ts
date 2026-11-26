import { StockPrueba } from "../soporte/stock-prueba";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-105: pedidos pagados y cobros protegidos en la base. Solo Supabase local: nunca escribe
// en la base compartida aunque el runner cargue sus variables.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = (() => { try { return !!url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname); } catch { return false; } })();
const restaurante = "10000000-0000-0000-0000-000000000001";
const polleria = "10000000-0000-0000-0000-000000000002";
const stockPrueba = new StockPrueba(restaurante);
const motivo = "Prueba local US-105: cliente se retiró";

type Rol = "caja" | "dueno" | "admin" | "mesero";
const correos: Record<Rol, string> = {
  caja: "caja@demo.altoque.pe", dueno: "dueno@demo.altoque.pe", admin: "admin@demo.altoque.pe", mesero: "mesero@demo.altoque.pe",
};
const c = {} as Record<Rol, SupabaseClient>;
const ids = {} as Record<Rol, string>;
let servicio: SupabaseClient;
let sucursal = "", producto = "", qrLlevar = "", sucursalPolleria = "";
let original: { wallet_holder_name: string | null; prepay_dine_in: boolean } | undefined;
const mesas: { mesa: string; sesion: string; qr: string }[] = [];
const pedidos: string[] = [];
const rutas: string[] = [];

function exigir<T>({ data, error }: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (error || data == null) throw new Error(error?.message ?? "Sin datos");
  return data;
}
const token = () => (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");

async function crearMesa() {
  const mesa = exigir(await servicio.from("dining_tables").insert({
    restaurant_id: restaurante, branch_id: sucursal, number: 20000 + Math.floor(Math.random() * 10000), active: true,
  }).select("id").single<{ id: string }>()).id;
  const sesion = exigir(await servicio.from("table_sessions").insert({
    restaurant_id: restaurante, branch_id: sucursal, dining_table_id: mesa, opened_by: ids.caja,
  }).select("id").single<{ id: string }>()).id;
  const qr = exigir(await servicio.from("qr_codes").insert({
    restaurant_id: restaurante, branch_id: sucursal, dining_table_id: mesa, purpose: "DINE_IN", token_hash: token(),
  }).select("id").single<{ id: string }>()).id;
  const fila = { mesa, sesion, qr };
  mesas.push(fila);
  return fila;
}

async function pedirQr(qr: string, modalidad: "DINE_IN" | "TAKEAWAY") {
  const id = exigir(await servicio.rpc("registrar_pedido_cliente", {
    p_qr_code_id: qr, p_idempotency_key: crypto.randomUUID(),
    p_items: [{ productoId: producto, cantidad: 1, observacion: "Prueba local US-105" }],
    p_modality: modalidad, p_customer_name: modalidad === "TAKEAWAY" ? "Prueba US-105" : null, p_customer_phone: null,
    p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
  }).single<{ pedido_id: string }>()).pedido_id;
  pedidos.push(id);
  return id;
}
async function ponerPendiente(id: string) {
  exigir(await servicio.from("orders").update({ status: "PENDING" }).eq("id", id).select("id").single());
}
async function estadoDe(id: string) {
  return exigir(await servicio.from("orders").select("status").eq("id", id).single<{ status: string }>()).status;
}
const pagar = (rol: Rol, cuenta: { sesion?: string; pedido?: string }, metodo: "CASH" | "YAPE", monto = "10.00") =>
  c[rol].rpc("registrar_pago", {
    p_sesion_id: cuenta.sesion ?? null, p_pedido_id: cuenta.sesion ? null : cuenta.pedido, p_metodo: metodo, p_monto: monto,
    p_recibido: metodo === "CASH" ? monto : null, p_referencia: metodo === "YAPE" ? `US105-${crypto.randomUUID().slice(0, 8)}` : null,
    p_aprobado: null, p_clave: crypto.randomUUID(),
  }).single<{ pago_id: string; estado: string }>();
const cambiarEstado = (rol: Rol, pedido: string, estado: string, conMotivo: string | null) =>
  c[rol].rpc("cambiar_estado_pedido", { p_pedido_id: pedido, p_estado: estado, p_motivo: conMotivo });

async function subirCaptura(sesion: string, huella = token(), clave = crypto.randomUUID()) {
  const ruta = `${restaurante}/${crypto.randomUUID()}.jpg`;
  rutas.push(ruta);
  const subida = await servicio.storage.from("capturas-pago").upload(ruta, new Uint8Array([255, 216, 255, 224, 0, 0, 255, 217]), { contentType: "image/jpeg" });
  if (subida.error) throw subida.error;
  const parametros = { p_sesion_id: sesion, p_pedido_id: null, p_clave: clave, p_wallet: "YAPE", p_monto: 10, p_storage_path: ruta, p_sha256: huella };
  return { parametros, resultado: await servicio.rpc("registrar_pago_captura", parametros).single<{ captura_id: string }>() };
}

// Pedido insertado directo (como service_role) para controlar la hora de creación.
async function pedidoConFecha(creadoEn: string, restauranteId = restaurante, rama = sucursal) {
  const fila = exigir(await servicio.from("orders").insert({
    restaurant_id: restauranteId, branch_id: rama, modality: "TAKEAWAY", status: "DELIVERED", total: 1,
    idempotency_key: crypto.randomUUID(),
    source: "WAITER", created_by: ids.caja, created_at: creadoEn,
  }).select("id, business_date, daily_number").single<{ id: string; business_date: string; daily_number: number }>());
  pedidos.push(fila.id);
  return fila;
}
// Fecha lejana distinta en cada corrida: el contador de ese día empieza vacío.
function diaLejano() {
  const anio = 2300 + Math.floor(Math.random() * 600);
  const mes = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const dia = String(2 + Math.floor(Math.random() * 26)).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

describe.skipIf(!local)("US-105: pedidos pagados y cobros protegidos (solo Supabase local)", () => {
  beforeAll(async () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: publica, SUPABASE_SERVICE_ROLE_KEY: clave, DEMO_PASSWORD: password } = process.env;
    if (!publica || !clave || !password) throw new Error("Falta configuración local.");
    const cliente = (key: string) => createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    servicio = cliente(clave);
    for (const rol of Object.keys(correos) as Rol[]) {
      const sesion = cliente(publica);
      const { data, error } = await sesion.auth.signInWithPassword({ email: correos[rol], password });
      if (error || !data.user) throw new Error(`No se pudo iniciar sesión como ${rol}`);
      c[rol] = sesion;
      ids[rol] = data.user.id;
    }
    original = exigir(await servicio.from("restaurants").select("wallet_holder_name,prepay_dine_in").eq("id", restaurante).single());
    exigir(await servicio.from("restaurants").update({ wallet_holder_name: "Titular prueba local" }).eq("id", restaurante).select("id").single());
    sucursal = exigir(await servicio.from("branches").insert({ restaurant_id: restaurante, name: `US-105 ${crypto.randomUUID()}`, active: true })
      .select("id").single<{ id: string }>()).id;
    sucursalPolleria = exigir(await servicio.from("branches").select("id").eq("restaurant_id", polleria).limit(1).single<{ id: string }>()).id;
    const categoria = exigir(await servicio.from("categories").select("id").eq("restaurant_id", restaurante).limit(1).single<{ id: string }>()).id;
    producto = exigir(await servicio.from("products").insert({
      restaurant_id: restaurante, category_id: categoria, name: `US-105 ${crypto.randomUUID()}`, price: 10, active: true, available: true,
    }).select("id").single<{ id: string }>()).id;
    await stockPrueba.preparar(producto, 100, { limitar: true });
    qrLlevar = exigir(await servicio.from("qr_codes").insert({
      restaurant_id: restaurante, branch_id: sucursal, purpose: "TAKEAWAY", token_hash: token(),
    }).select("id").single<{ id: string }>()).id;
  }, 60_000);

  afterAll(async () => {
    if (!servicio) return;
    const errores: string[] = [];
    const revisar = (r: { error: { message: string } | null }) => { if (r.error) errores.push(r.error.message); };
    try {
      if (rutas.length) revisar(await servicio.storage.from("capturas-pago").remove(rutas));
      const sesiones = mesas.map((m) => m.sesion);
      // Primero los pagos (apuntan a sus capturas) y después las capturas que queden.
      if (pedidos.length) {
        revisar(await servicio.from("order_refunds").delete().in("order_id", pedidos));
        revisar(await servicio.from("payments").delete().in("order_id", pedidos));
        revisar(await servicio.from("payment_proofs").delete().in("order_id", pedidos));
      }
      if (sesiones.length) {
        revisar(await servicio.from("payments").delete().in("table_session_id", sesiones));
        revisar(await servicio.from("payment_proofs").delete().in("table_session_id", sesiones));
      }
      if (pedidos.length) {
        revisar(await servicio.from("order_items").delete().in("order_id", pedidos));
        revisar(await servicio.from("orders").delete().in("id", pedidos));
      }
      for (const m of mesas) {
        revisar(await servicio.from("qr_codes").delete().eq("id", m.qr));
        revisar(await servicio.from("table_sessions").delete().eq("id", m.sesion));
        revisar(await servicio.from("dining_tables").delete().eq("id", m.mesa));
      }
      if (qrLlevar) revisar(await servicio.from("qr_codes").delete().eq("id", qrLlevar));
      if (producto) {
        revisar(await servicio.from("product_daily_stock").delete().eq("product_id", producto));
        revisar(await servicio.from("products").delete().eq("id", producto));
      }
      if (sucursal) revisar(await servicio.from("branches").delete().eq("id", sucursal));
      if (original) revisar(await servicio.from("restaurants").update(original).eq("id", restaurante));
    } finally {
      await stockPrueba.restaurar().catch((error) => errores.push(String(error)));
      for (const cliente of Object.values(c)) await cliente.auth.signOut({ scope: "local" });
    }
    if (errores.length) throw new Error(`Limpieza US-105: ${errores.join("; ")}`);
  }, 60_000);

  it("pago parcial: el pedido pagado entra a cocina y no vence aunque la mesa deba otro", async () => {
    const cuenta = await crearMesa();
    const pagado = await pedirQr(cuenta.qr, "DINE_IN");
    const debe = await pedirQr(cuenta.qr, "DINE_IN");
    await ponerPendiente(pagado);
    await ponerPendiente(debe);

    const pago = exigir(await pagar("caja", { sesion: cuenta.sesion }, "CASH"));
    expect(pago.estado).toBe("CONFIRMED");
    // El pago alcanza para el pedido más antiguo: ese pasa a cocina; el otro sigue esperando.
    expect(await estadoDe(pagado)).toBe("IN_PROGRESS");
    expect(await estadoDe(debe)).toBe("PENDING");
    expect(exigir(await c.caja.rpc("pedido_pagado", { p_pedido_id: pagado }))).toBe(true);
    expect(exigir(await c.caja.rpc("pedido_pagado", { p_pedido_id: debe }))).toBe(false);

    // Vencimiento: aunque el pagado siguiera en espera, no se cancela; el impago sí.
    await ponerPendiente(pagado);
    const hace16 = new Date(Date.now() - 16 * 60_000).toISOString();
    exigir(await servicio.from("orders").update({ created_at: hace16 }).in("id", [pagado, debe]).select("id"));
    exigir(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restaurante }));
    expect(await estadoDe(pagado)).toBe("PENDING");
    expect(await estadoDe(debe)).toBe("CANCELLED");
  });

  it("cancelación por rol: el mesero no cancela un pagado; dueño/admin sí, con motivo, y queda la devolución", async () => {
    const pedido = await pedirQr(qrLlevar, "TAKEAWAY");
    const sinPagar = await pedirQr(qrLlevar, "TAKEAWAY");
    expect(exigir(await pagar("caja", { pedido }, "CASH")).estado).toBe("CONFIRMED");
    expect(exigir(await c.mesero.rpc("pedido_pagado", { p_pedido_id: pedido }))).toBe(true);

    expect((await cambiarEstado("mesero", pedido, "CANCELLED", motivo)).error?.message).toContain("PAID_ORDER_ADMIN_ONLY");
    expect((await cambiarEstado("caja", pedido, "CANCELLED", motivo)).error?.message).toContain("FORBIDDEN");
    expect((await cambiarEstado("admin", pedido, "CANCELLED", null)).error?.message).toContain("REASON_REQUIRED");
    expect(await estadoDe(pedido)).not.toBe("CANCELLED");
    expect((await cambiarEstado("dueno", pedido, "CANCELLED", motivo)).error).toBeNull();
    expect(await estadoDe(pedido)).toBe("CANCELLED");

    // Sin pago, el mesero sigue pudiendo cancelar y no queda devolución.
    if (await estadoDe(sinPagar) !== "CANCELLED") {
      expect((await cambiarEstado("mesero", sinPagar, "CANCELLED", motivo)).error).toBeNull();
    }
    expect((await servicio.from("order_refunds").select("id").eq("order_id", sinPagar)).data).toEqual([]);

    const devolucion = exigir(await c.caja.from("order_refunds").select("id, amount, status, reason, requested_by")
      .eq("order_id", pedido).single<{ id: string; amount: number; status: string; reason: string; requested_by: string }>());
    expect(devolucion).toMatchObject({ status: "PENDING", reason: motivo, requested_by: ids.dueno });
    expect(Number(devolucion.amount)).toBe(10);
    expect((await c.mesero.from("order_refunds").select("id").eq("order_id", pedido)).data).toEqual([]);

    expect((await c.mesero.rpc("marcar_devolucion_realizada", { p_devolucion_id: devolucion.id })).error?.message).toContain("FORBIDDEN");
    expect((await c.caja.rpc("marcar_devolucion_realizada", { p_devolucion_id: devolucion.id })).error).toBeNull();
    expect((await c.admin.rpc("marcar_devolucion_realizada", { p_devolucion_id: devolucion.id })).error?.message).toContain("ALREADY_REFUNDED");
    const hecha = exigir(await servicio.from("order_refunds").select("status, refunded_by, refunded_at").eq("id", devolucion.id)
      .single<{ status: string; refunded_by: string; refunded_at: string | null }>());
    expect(hecha).toMatchObject({ status: "REFUNDED", refunded_by: ids.caja });
    expect(hecha.refunded_at).not.toBeNull();
  });

  it("captura duplicada: se marca, no se confirma dos veces y el límite es 3 por cuenta", async () => {
    const cuenta = await crearMesa();
    await pedirQr(cuenta.qr, "DINE_IN");
    const huella = "d".repeat(64);
    const primera = await subirCaptura(cuenta.sesion, huella);
    const primeraId = exigir(primera.resultado).captura_id;
    const repetida = exigir((await subirCaptura(cuenta.sesion, huella)).resultado).captura_id;
    expect(exigir(await servicio.from("payment_proofs").select("duplicate").eq("id", repetida).single<{ duplicate: boolean }>()).duplicate).toBe(true);
    exigir((await subirCaptura(cuenta.sesion)).resultado);

    // Cuarta captura pendiente en la misma cuenta: rechazada. El reintento de una ya guardada sí responde.
    expect((await subirCaptura(cuenta.sesion)).resultado.error?.message).toContain("TOO_MANY_PENDING_PROOFS");
    const reintento = exigir(await servicio.rpc("registrar_pago_captura", primera.parametros).single<{ captura_id: string }>());
    expect(reintento.captura_id).toBe(primeraId);

    const verificar = (id: string) => c.caja.rpc("verificar_pago_captura", { p_captura_id: id, p_resultado: "COMPLETE", p_monto_recibido: null, p_motivo: null });
    expect((await verificar(primeraId)).error).toBeNull();
    expect((await verificar(primeraId)).error).not.toBeNull();
    // La copia (misma imagen) no puede cobrarse otra vez: la base la rechaza por imagen ya usada.
    expect((await verificar(repetida)).error?.message).toContain("PROOF_ALREADY_USED");
    expect(Number(exigir(await c.caja.rpc("saldo_cuenta_caja", { p_sesion_id: cuenta.sesion, p_pedido_id: null })))).toBe(0);
  });

  it("excedente: caja ve el saldo actual antes de confirmar; el mesero no", async () => {
    const cuenta = await crearMesa();
    await pedirQr(cuenta.qr, "DINE_IN");
    expect(Number(exigir(await c.caja.rpc("saldo_cuenta_caja", { p_sesion_id: cuenta.sesion, p_pedido_id: null })))).toBe(10);
    expect(Number(exigir(await c.admin.rpc("saldo_cuenta_caja", { p_sesion_id: cuenta.sesion, p_pedido_id: null })))).toBe(10);
    expect((await c.mesero.rpc("saldo_cuenta_caja", { p_sesion_id: cuenta.sesion, p_pedido_id: null })).error?.message).toContain("FORBIDDEN");
    expect((await pagar("caja", { sesion: cuenta.sesion }, "CASH", "15.00")).error?.message).toContain("AMOUNT_EXCEEDS_BALANCE");
  });

  it("quien registra un pago pendiente no lo verifica; el dueño sí puede verificar el de caja", async () => {
    const pedido = await pedirQr(qrLlevar, "TAKEAWAY");
    const yape = exigir(await pagar("caja", { pedido }, "YAPE"));
    expect(yape.estado).toBe("PENDING");
    expect((await c.caja.rpc("verificar_pago", { p_pago_id: yape.pago_id, p_confirmar: true })).error?.message).toContain("SELF_VERIFICATION");
    expect((await c.mesero.rpc("verificar_pago", { p_pago_id: yape.pago_id, p_confirmar: true })).error?.message).toContain("FORBIDDEN");
    expect(exigir(await c.dueno.rpc("verificar_pago", { p_pago_id: yape.pago_id, p_confirmar: true }))).toBe("CONFIRMED");
    expect(exigir(await servicio.from("payments").select("verified_by, created_by").eq("id", yape.pago_id)
      .single<{ verified_by: string; created_by: string }>())).toEqual({ verified_by: ids.dueno, created_by: ids.caja });
  });

  describe("número del día", () => {
    it("el primer pedido del día es el 1 y el pedido real de hoy recibe su número", async () => {
      const dia = diaLejano();
      const primero = await pedidoConFecha(`${dia}T15:00:00Z`);
      expect(primero).toMatchObject({ business_date: dia, daily_number: 1 });
      expect((await pedidoConFecha(`${dia}T16:00:00Z`)).daily_number).toBe(2);

      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
      const real = await pedirQr(qrLlevar, "TAKEAWAY");
      const fila = exigir(await servicio.from("orders").select("business_date, daily_number").eq("id", real)
        .single<{ business_date: string; daily_number: number }>());
      expect(fila.business_date).toBe(hoy);
      expect(fila.daily_number).toBeGreaterThan(0);
    });

    it("pedidos simultáneos no repiten número", async () => {
      const dia = diaLejano();
      const filas = await Promise.all(Array.from({ length: 6 }, () => pedidoConFecha(`${dia}T18:00:00Z`)));
      expect(filas.map((f) => f.daily_number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("el cambio de día en Lima (medianoche = 05:00 UTC) reinicia el conteo", async () => {
      const dia = diaLejano();
      const anterior = new Date(Date.parse(`${dia}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
      const antes = await pedidoConFecha(`${dia}T04:59:00Z`);
      const despues = await pedidoConFecha(`${dia}T05:00:00Z`);
      expect(antes).toMatchObject({ business_date: anterior, daily_number: 1 });
      expect(despues).toMatchObject({ business_date: dia, daily_number: 1 });
    });

    it("cada restaurante tiene su propio conteo y el número no se puede cambiar", async () => {
      const dia = diaLejano();
      const ceviche = await pedidoConFecha(`${dia}T15:00:00Z`);
      const pollo = await pedidoConFecha(`${dia}T15:00:00Z`, polleria, sucursalPolleria);
      expect(ceviche.daily_number).toBe(1);
      expect(pollo.daily_number).toBe(1);

      exigir(await servicio.from("orders").update({ daily_number: 99, business_date: "2000-01-01" }).eq("id", ceviche.id).select("id"));
      expect(exigir(await servicio.from("orders").select("business_date, daily_number").eq("id", ceviche.id).single()))
        .toEqual({ business_date: dia, daily_number: 1 });
    });
  });
});
