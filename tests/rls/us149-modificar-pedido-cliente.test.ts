import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const esLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url ?? "");
const restaurante = "10000000-0000-0000-0000-000000000001";
const fechaLima = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

type Qr = { id: string; hash: string; mesa?: string; sesion?: string };
type Pedido = { id: string; clave: string; qr: Qr };
type Edicion = { revision: string; items: { id: string; nombre: string; cantidad: number }[] } | { bloqueo: string };
type Respuesta<T> = { data: T | null; error: { message: string } | null };

let servicio: SupabaseClient;
let anonimo: SupabaseClient;
let caja: SupabaseClient;
let sucursal = "";
let usuario = "";
let mostrador: Qr;
let mesaUno: Qr;
let mesaDos: Qr;
const codigosQr: Qr[] = [];
const productos = new Map<string, string>();
const pedidos: Pedido[] = [];

function exigir<T>({ data, error }: Respuesta<T>): NonNullable<T> {
  if (error || data == null) throw new Error(error?.message ?? "Respuesta sin datos");
  return data;
}

function comprobar(respuesta: { error: { message: string } | null }) {
  if (respuesta.error) throw new Error(respuesta.error.message);
}

async function crearQr(mesaNumero?: number): Promise<Qr> {
  const hash = createHash("sha256").update(randomUUID()).digest("hex");
  const codigo = { id: "", hash } as Qr;
  codigosQr.push(codigo);
  if (mesaNumero !== undefined) {
    codigo.mesa = exigir(await servicio.from("dining_tables").insert({
      restaurant_id: restaurante, branch_id: sucursal, number: mesaNumero,
    }).select("id").single<{ id: string }>()).id;
    codigo.sesion = exigir(await servicio.from("table_sessions").insert({
      restaurant_id: restaurante, branch_id: sucursal, dining_table_id: codigo.mesa, opened_by: usuario,
    }).select("id").single<{ id: string }>()).id;
  }
  codigo.id = exigir(await servicio.from("qr_codes").insert({
    restaurant_id: restaurante, branch_id: sucursal, purpose: codigo.mesa ? "DINE_IN" : "TAKEAWAY",
    dining_table_id: codigo.mesa ?? null, token_hash: hash,
  }).select("id").single<{ id: string }>()).id;
  return codigo;
}

async function pedir(qr = mostrador, platos = ["Ceviche"], cantidad = 1): Promise<Pedido> {
  const clave = randomUUID();
  const { pedido_id } = exigir(await servicio.rpc("registrar_pedido_cliente", {
    p_qr_code_id: qr.id, p_idempotency_key: clave,
    p_items: platos.map((nombre) => ({ productoId: productos.get(nombre), cantidad, observacion: "Prueba local US-149" })),
    p_modality: qr.mesa ? "DINE_IN" : "TAKEAWAY", p_customer_name: qr.mesa ? null : "Prueba US-149",
    p_customer_phone: qr.mesa ? null : "999999999",
    p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
  }).single<{ pedido_id: string }>());
  const pedido = { id: pedido_id, clave, qr };
  pedidos.push(pedido);
  return pedido;
}

async function leer(pedido: Pedido, qr = pedido.qr): Promise<Respuesta<Edicion>> {
  const { data, error } = await servicio.rpc("leer_edicion_pedido_cliente", { p_token_hash: qr.hash, p_clave: pedido.clave });
  return { data: data as Edicion | null, error };
}

async function edicion(pedido: Pedido) {
  const datos = exigir(await leer(pedido));
  if ("bloqueo" in datos) throw new Error(datos.bloqueo);
  return datos;
}

function modificar(pedido: Pedido, revision: string, cambios: object[], anular = false, qr = pedido.qr) {
  return servicio.rpc("modificar_pedido_cliente", {
    p_token_hash: qr.hash, p_clave: pedido.clave, p_revision: revision,
    p_cambios: cambios, p_confirmar_anulacion: anular,
  });
}

async function stock(nombre: string) {
  return exigir(await servicio.from("product_daily_stock").select("sold")
    .eq("restaurant_id", restaurante).eq("product_id", productos.get(nombre)!)
    .eq("stock_date", fechaLima).single<{ sold: number }>()).sold;
}

async function historial(pedido: Pedido, evento: string) {
  return exigir(await servicio.from("order_status_history").select("changed_by, reason, event, to_status")
    .eq("restaurant_id", restaurante).eq("order_id", pedido.id).eq("event", evento).order("created_at", { ascending: false }));
}

async function registrarPago(pedido: Pedido, status: "CONFIRMED" | "PENDING", amount: number) {
  const efectivo = status === "CONFIRMED";
  const { pago_id, vuelto } = exigir(await caja.rpc("registrar_pago", {
    p_sesion_id: pedido.qr.sesion ?? null, p_pedido_id: pedido.qr.sesion ? null : pedido.id,
    p_metodo: efectivo ? "CASH" : "YAPE", p_monto: amount,
    p_recibido: efectivo ? amount + 5 : null, p_aprobado: null,
    p_referencia: efectivo ? null : `US149-${randomUUID().slice(0, 8)}`, p_clave: randomUUID(),
  }).single<{ pago_id: string; vuelto: number | null }>());
  if (efectivo) expect(Number(vuelto)).toBe(5);
  return pago_id;
}

describe.skipIf(!esLocal)("US-149: edición de pedidos QR en Supabase local", () => {
  beforeAll(async () => {
    const { SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
    if (!SUPABASE_SERVICE_ROLE_KEY || !NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Faltan claves locales de Supabase.");
    servicio = createClient(url!, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    anonimo = createClient(url!, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    caja = createClient(url!, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const acceso = await servicio.auth.admin.generateLink({ type: "magiclink", email: "caja@demo.altoque.pe" });
    if (acceso.error) throw new Error(acceso.error.message);
    const sesion = exigir(await caja.auth.verifyOtp({ type: "email", token_hash: acceso.data.properties.hashed_token }));
    if (!sesion.user) throw new Error("No se pudo iniciar la sesión local de caja.");
    usuario = sesion.user.id;
    sucursal = exigir(await servicio.from("branches").insert({
      restaurant_id: restaurante, name: `Prueba local US-149 ${randomUUID()}`,
    }).select("id").single<{ id: string }>()).id;
    const categoria = exigir(await servicio.from("categories").select("id")
      .eq("restaurant_id", restaurante).limit(1).single<{ id: string }>()).id;
    for (const [nombre, price, quantity] of [["Ceviche", 10, 4], ["Chicha", 5, 1]] as const) {
      const producto = exigir(await servicio.from("products").insert({
        restaurant_id: restaurante, category_id: categoria, name: `US-149 ${nombre} ${randomUUID().slice(0, 8)}`, price,
      }).select("id").single<{ id: string }>()).id;
      productos.set(nombre, producto);
      comprobar(await servicio.from("product_daily_stock").insert({
        restaurant_id: restaurante, product_id: producto, stock_date: fechaLima, quantity,
      }));
    }
    mostrador = await crearQr();
    mesaUno = await crearQr(1);
    mesaDos = await crearQr(2);
  });

  afterEach(async () => {
    for (const pedido of pedidos) {
      for (const tabla of ["payments", "stripe_checkout_attempts"]) {
        comprobar(await servicio.from(tabla).delete().eq("restaurant_id", restaurante)
          .eq(pedido.qr.sesion ? "table_session_id" : "order_id", pedido.qr.sesion ?? pedido.id));
      }
      comprobar(await servicio.from("orders").update({ status: "CANCELLED" })
        .eq("restaurant_id", restaurante).eq("id", pedido.id));
      comprobar(await servicio.from("orders").delete().eq("restaurant_id", restaurante).eq("id", pedido.id));
    }
    pedidos.length = 0;
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const qr of codigosQr) {
      if (qr.id) comprobar(await servicio.from("qr_codes").delete().eq("restaurant_id", restaurante).eq("id", qr.id));
      if (qr.sesion) comprobar(await servicio.from("table_sessions").delete().eq("restaurant_id", restaurante).eq("id", qr.sesion));
      if (qr.mesa) comprobar(await servicio.from("dining_tables").delete().eq("restaurant_id", restaurante).eq("id", qr.mesa));
    }
    for (const producto of productos.values()) {
      comprobar(await servicio.from("product_daily_stock").delete().eq("restaurant_id", restaurante).eq("product_id", producto));
      comprobar(await servicio.from("products").delete().eq("restaurant_id", restaurante).eq("id", producto));
    }
    if (sucursal) comprobar(await servicio.from("branches").delete().eq("restaurant_id", restaurante).eq("id", sucursal));
  });

  it("edita cantidad y observación, quita un plato, recalcula con el precio guardado y registra al cliente", async () => {
    const pedido = await pedir(mesaUno, ["Ceviche", "Chicha"], 1);
    const datos = await edicion(pedido);
    const ceviche = datos.items.find(({ nombre }) => nombre.includes("Ceviche"))!;
    const chicha = datos.items.find(({ nombre }) => nombre.includes("Chicha"))!;
    expect(exigir(await modificar(pedido, datos.revision, [
      { itemId: ceviche.id, cantidad: 2, observacion: "Sin ají", precioUnitarioCentimos: 1 },
      { itemId: chicha.id, cantidad: 0 },
    ]))).toEqual({ cancelado: false, totalCentimos: 2_000 });
    expect(await stock("Ceviche")).toBe(2);
    expect(await stock("Chicha")).toBe(0);
    expect((await edicion(pedido)).items).toMatchObject([{ id: ceviche.id, cantidad: 2, observacion: "Sin ají" }]);
    expect(await historial(pedido, "MODIFIED")).toEqual([
      { changed_by: null, reason: null, event: "MODIFIED", to_status: "PENDING" },
    ]);
    const actualizado = await edicion(pedido);
    expect(exigir(await modificar(pedido, actualizado.revision, [{ itemId: ceviche.id, cantidad: 1 }])))
      .toMatchObject({ totalCentimos: 1_000 });
    expect(await stock("Ceviche")).toBe(1);
    expect((await modificar(pedido, datos.revision, [{ itemId: ceviche.id, cantidad: 3 }])).error?.message)
      .toBe("ORDER_CHANGED");
  });

  it("exige confirmación para anular, libera stock una vez y conserva el historial", async () => {
    const pedido = await pedir();
    const datos = await edicion(pedido);
    const cambios = [{ itemId: datos.items[0].id, cantidad: 0 }];
    expect((await modificar(pedido, datos.revision, cambios)).error?.message).toBe("CANCEL_CONFIRMATION_REQUIRED");
    expect(await stock("Ceviche")).toBe(1);
    expect(exigir(await modificar(pedido, datos.revision, cambios, true))).toEqual({ cancelado: true, totalCentimos: 0 });
    expect(await stock("Ceviche")).toBe(0);
    expect((await historial(pedido, "STATUS"))[0]).toMatchObject({
      changed_by: null, reason: "Anulado por el cliente", to_status: "CANCELLED",
    });
    expect(exigir(await leer(pedido))).toEqual({ bloqueo: "INVALID_STATE" });
    expect((await modificar(pedido, datos.revision, cambios, true)).error?.message).toBe("INVALID_STATE");
    expect(await stock("Ceviche")).toBe(0);
  });

  it("rechaza una edición después de un pago confirmado", async () => {
    const pedido = await pedir();
    const datos = await edicion(pedido);
    await registrarPago(pedido, "CONFIRMED", 10);
    expect(exigir(await leer(pedido))).toMatchObject({ bloqueo: expect.stringMatching(/^(INVALID_STATE|PAYMENT_CONFIRMED)$/) });
    expect((await modificar(pedido, datos.revision, [{ itemId: datos.items[0].id, cantidad: 2 }])).error?.message)
      .toMatch(/^(INVALID_STATE|PAYMENT_CONFIRMED)$/);
    expect(await stock("Ceviche")).toBe(1);
  });

  it("bloquea un abono parcial aplicable sin confundirlo con el pago de un pedido anterior", async () => {
    const anterior = await pedir(mesaUno);
    await registrarPago(anterior, "CONFIRMED", 10);
    const siguiente = await pedir(mesaUno);
    const datos = await edicion(siguiente);
    await registrarPago(siguiente, "CONFIRMED", 5);
    expect(exigir(await leer(siguiente))).toEqual({ bloqueo: "PAYMENT_CONFIRMED" });
    expect((await modificar(siguiente, datos.revision, [{ itemId: datos.items[0].id, cantidad: 0 }], true)).error?.message)
      .toBe("PAYMENT_CONFIRMED");
  });

  it("rechaza un aumento cuando se agotó el stock sin guardar cambios parciales", async () => {
    const pedido = await pedir(mostrador, ["Ceviche", "Chicha"]);
    const datos = await edicion(pedido);
    const ceviche = datos.items.find(({ nombre }) => nombre.includes("Ceviche"))!;
    const chicha = datos.items.find(({ nombre }) => nombre.includes("Chicha"))!;
    expect((await modificar(pedido, datos.revision, [
      { itemId: ceviche.id, cantidad: 0 }, { itemId: chicha.id, cantidad: 2 },
    ])).error?.message).toMatch(/^STOCK_INSUFFICIENT:/);
    expect(await edicion(pedido)).toEqual(datos);
    expect(await stock("Ceviche")).toBe(1);
    expect(await historial(pedido, "MODIFIED")).toEqual([]);
  });

  it("impide leer o editar desde otro QR y bloquea el RPC directo anónimo", async () => {
    const pedido = await pedir(mesaUno);
    const datos = await edicion(pedido);
    expect((await leer(pedido, mesaDos)).data).toBeNull();
    expect((await modificar(pedido, datos.revision, [{ itemId: datos.items[0].id, cantidad: 2 }], false, mesaDos)).error?.message)
      .toBe("ORDER_NOT_FOUND");
    const intento = await anonimo.rpc("leer_edicion_pedido_cliente", { p_token_hash: pedido.qr.hash, p_clave: pedido.clave });
    expect(intento.error).not.toBeNull();
    expect(await edicion(pedido)).toEqual(datos);
  });

  it("espera la verificación de Yape y permite editar si se rechaza", async () => {
    const pedido = await pedir(mesaUno);
    const datos = await edicion(pedido);
    const id = await registrarPago(pedido, "PENDING", 10);
    expect(exigir(await leer(pedido))).toEqual({ bloqueo: "PAYMENT_PENDING" });
    const cambios = [{ itemId: datos.items[0].id, cantidad: 2 }];
    expect((await modificar(pedido, datos.revision, cambios)).error?.message).toBe("PAYMENT_PENDING");
    comprobar(await servicio.from("payments").update({ status: "FAILED" }).eq("restaurant_id", restaurante).eq("id", id));
    expect(exigir(await modificar(pedido, datos.revision, cambios))).toMatchObject({ totalCentimos: 2_000 });
  });

  it("bloquea un Checkout en creación o abierto hasta que deja de estar vigente", async () => {
    const pedido = await pedir();
    const datos = await edicion(pedido);
    const { checkout_id } = exigir(await servicio.rpc("iniciar_checkout_stripe", {
      p_sesion_id: null, p_pedido_id: pedido.id,
    }).single<{ checkout_id: string }>());
    const cambios = [{ itemId: datos.items[0].id, cantidad: 2 }];
    expect(exigir(await leer(pedido))).toEqual({ bloqueo: "CHECKOUT_OPEN" });
    expect((await modificar(pedido, datos.revision, cambios)).error?.message).toBe("CHECKOUT_OPEN");
    expect(exigir(await servicio.rpc("vincular_checkout_stripe", {
      p_checkout_id: checkout_id, p_session_id: `cs_test_US149${randomUUID().replaceAll("-", "")}`,
    }))).toBe(true);
    expect((await modificar(pedido, datos.revision, cambios)).error?.message).toBe("CHECKOUT_OPEN");
    comprobar(await servicio.from("stripe_checkout_attempts").update({ expires_at: new Date(0).toISOString() })
      .eq("restaurant_id", restaurante).eq("id", checkout_id));
    expect(exigir(await modificar(pedido, datos.revision, cambios))).toMatchObject({ totalCentimos: 2_000 });
  });
});
