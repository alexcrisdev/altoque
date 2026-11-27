import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const esLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url ?? "");
const restaurante = "10000000-0000-0000-0000-000000000001";
type Qr = { id: string; hash: string; mesa?: string; sesion?: string };
type Pedido = { id: string; clave: string; qr: Qr };
type Estado = { solicitado: boolean; saldoCentimos: number; numero: number; limitePago: string };

function datos<T>({ data, error }: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (error || data == null) throw new Error(error?.message ?? "Respuesta sin datos");
  return data;
}

function validar({ error }: { error: { message: string } | null }) {
  if (error) throw new Error(error.message);
}

describe.skipIf(!esLocal)("US-150: pago en caja en Supabase local", () => {
  let servicio: SupabaseClient, caja: SupabaseClient, anonimo: SupabaseClient;
  let rama = "", producto = "", usuario = "";
  let qrMesa: Qr, qrAjeno: Qr, qrMostrador: Qr;
  const qrs: Qr[] = [];
  const pedidos: Pedido[] = [];

  async function crearQr(numero?: number) {
    const qr: Qr = { id: "", hash: createHash("sha256").update(randomUUID()).digest("hex") };
    qrs.push(qr);
    if (numero !== undefined) {
      qr.mesa = datos(await servicio.from("dining_tables")
        .insert({ restaurant_id: restaurante, branch_id: rama, number: numero }).select("id").single<{ id: string }>()).id;
      qr.sesion = datos(await servicio.from("table_sessions")
        .insert({ restaurant_id: restaurante, branch_id: rama, dining_table_id: qr.mesa, opened_by: usuario })
        .select("id").single<{ id: string }>()).id;
    }
    qr.id = datos(await servicio.from("qr_codes").insert({
      restaurant_id: restaurante, branch_id: rama, purpose: qr.mesa ? "DINE_IN" : "TAKEAWAY",
      dining_table_id: qr.mesa ?? null, token_hash: qr.hash,
    }).select("id").single<{ id: string }>()).id;
    return qr;
  }

  async function pedir(qr: Qr) {
    const clave = randomUUID();
    const { pedido_id } = datos(await servicio.rpc("registrar_pedido_cliente", {
      p_qr_code_id: qr.id, p_idempotency_key: clave, p_modality: qr.mesa ? "DINE_IN" : "TAKEAWAY",
      p_items: [{ productoId: producto, cantidad: 1, observacion: "Prueba local US-150" }],
      p_customer_name: qr.mesa ? null : "Prueba US-150", p_customer_phone: qr.mesa ? null : "999999999",
      p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null,
    }).single<{ pedido_id: string }>());
    const pedido = { id: pedido_id, clave, qr };
    pedidos.push(pedido);
    return pedido;
  }

  const registrarEleccion = (pedido: Pedido, elegir: boolean, qr = pedido.qr) =>
    servicio.rpc("elegir_pago_en_caja_cliente", { p_token_hash: qr.hash, p_clave: pedido.clave, p_elegir: elegir });
  const leer = (pedido: Pedido) => datosFila(pedido.id);
  async function datosFila(id: string) {
    return datos(await servicio.from("orders").select("status, created_at, pago_en_caja_desde, daily_number")
      .eq("restaurant_id", restaurante).eq("id", id)
      .single<{ status: string; created_at: string; pago_en_caja_desde: string | null; daily_number: number }>());
  }

  const cobrar = (pedido: Pedido, clave: string, monto = 10) => caja.rpc("registrar_efectivo_pedido_caja", {
    p_pedido_id: pedido.id, p_sesion_id: pedido.qr.sesion ?? null, p_monto: monto, p_recibido: 15, p_clave: clave,
  }).single<{ pago_id: string; vuelto: number; estado: string }>();

  beforeAll(async () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
    if (!anon || !key) throw new Error("Faltan claves de Supabase local.");
    const cliente = (clave: string) => createClient(url!, clave, { auth: { persistSession: false } });
    servicio = cliente(key);
    caja = cliente(anon);
    anonimo = cliente(anon);
    const acceso = await servicio.auth.admin.generateLink({ type: "magiclink", email: "caja@demo.altoque.pe" });
    if (acceso.error) throw acceso.error;
    const sesion = datos(await caja.auth.verifyOtp({ type: "email", token_hash: acceso.data.properties.hashed_token }));
    if (!sesion.user) throw new Error("Falta sesión de caja local.");
    usuario = sesion.user.id;
    rama = datos(await servicio.from("branches").insert({ restaurant_id: restaurante, name: `US-150 ${randomUUID()}` })
      .select("id").single<{ id: string }>()).id;
    const categoria = datos(await servicio.from("categories").select("id").eq("restaurant_id", restaurante)
      .limit(1).single<{ id: string }>()).id;
    producto = datos(await servicio.from("products").insert({
      restaurant_id: restaurante, category_id: categoria, name: `US-150 ${randomUUID().slice(0, 8)}`, price: 10,
    }).select("id").single<{ id: string }>()).id;
    qrMesa = await crearQr(1);
    qrAjeno = await crearQr(2);
    qrMostrador = await crearQr();
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const pedido of pedidos) {
      validar(await servicio.from("payments").delete().eq("restaurant_id", restaurante)
        .eq(pedido.qr.sesion ? "table_session_id" : "order_id", pedido.qr.sesion ?? pedido.id));
      validar(await servicio.from("orders").update({ status: "CANCELLED" }).eq("restaurant_id", restaurante).eq("id", pedido.id));
      validar(await servicio.from("orders").delete().eq("restaurant_id", restaurante).eq("id", pedido.id));
    }
    for (const qr of qrs) {
      if (qr.id) validar(await servicio.from("qr_codes").delete().eq("id", qr.id).eq("restaurant_id", restaurante));
      if (qr.sesion) validar(await servicio.from("table_sessions").delete().eq("id", qr.sesion).eq("restaurant_id", restaurante));
      if (qr.mesa) validar(await servicio.from("dining_tables").delete().eq("id", qr.mesa).eq("restaurant_id", restaurante));
    }
    if (producto) validar(await servicio.from("products").delete().eq("id", producto).eq("restaurant_id", restaurante));
    if (rama) validar(await servicio.from("branches").delete().eq("id", rama).eq("restaurant_id", restaurante));
  });

  it("valida el QR y cobra solo el segundo pedido de mesa aunque el primero siga esperando", async () => {
    const primero = await pedir(qrMesa);
    const elegido = await pedir(qrMesa);
    expect((await registrarEleccion(elegido, true, qrAjeno)).error?.message).toBe("ORDER_NOT_FOUND");
    expect((await leer(elegido)).pago_en_caja_desde).toBeNull();
    const estado = datos(await registrarEleccion(elegido, true)) as Estado;
    expect(estado).toMatchObject({ solicitado: true, saldoCentimos: 1000, numero: (await leer(elegido)).daily_number });
    expect((await leer(elegido)).status).toBe("PENDING");
    const lista = datos(await caja.rpc("listar_pedidos_pago_en_caja", { p_restaurante: restaurante, p_pedido: elegido.id }));
    expect(lista).toMatchObject([{ pedido_id: elegido.id, mesa_sesion_id: qrMesa.sesion, saldo_centimos: 1000 }]);
    const anon = await anonimo.rpc("registrar_efectivo_pedido_caja", {
      p_pedido_id: elegido.id, p_sesion_id: qrMesa.sesion, p_monto: 10, p_recibido: 15, p_clave: randomUUID(),
    });
    expect(anon.error).not.toBeNull();
    expect((await cobrar(elegido, randomUUID(), 9)).error?.message).toBe("CASH_ORDER_BALANCE_CHANGED");
    const clave = randomUUID();
    const cobro = datos(await cobrar(elegido, clave));
    expect(cobro).toMatchObject({ estado: "CONFIRMED", vuelto: 5 });
    expect(datos(await cobrar(elegido, clave)).pago_id).toBe(cobro.pago_id);
    expect((await leer(elegido)).status).toBe("IN_PROGRESS");
    expect((await leer(primero)).status).toBe("PENDING");
    expect(datos(await caja.rpc("listar_pedidos_pago_en_caja", { p_restaurante: restaurante, p_pedido: elegido.id }))).toEqual([]);
  });

  it("mantiene el plazo ampliado al salir de caja, admite edición tras 15 minutos y vence a los 30", async () => {
    const pedido = await pedir(qrMostrador);
    const creado = Date.now() - 14 * 60_000;
    validar(await servicio.from("orders").update({ created_at: new Date(creado).toISOString() })
      .eq("restaurant_id", restaurante).eq("id", pedido.id));
    const elegido = datos(await registrarEleccion(pedido, true)) as Estado;
    expect(Date.parse(elegido.limitePago) - creado).toBe(30 * 60_000);
    const otroMedio = datos(await registrarEleccion(pedido, false)) as Estado;
    expect(otroMedio).toMatchObject({ solicitado: false, limitePago: elegido.limitePago });
    expect((datos(await registrarEleccion(pedido, true)) as Estado).limitePago).toBe(elegido.limitePago);
    validar(await servicio.from("orders").update({ created_at: new Date(creado - 4 * 60_000).toISOString() })
      .eq("restaurant_id", restaurante).eq("id", pedido.id));
    validar(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restaurante }));
    expect((await leer(pedido)).status).toBe("PENDING");
    expect(datos(await servicio.rpc("leer_edicion_pedido_cliente", {
      p_token_hash: qrMostrador.hash, p_clave: pedido.clave,
    }))).toMatchObject({ revision: expect.any(String) });
    validar(await servicio.from("orders").update({ pago_en_caja_hasta: new Date(creado).toISOString() })
      .eq("restaurant_id", restaurante).eq("id", pedido.id));
    validar(await servicio.rpc("vencer_pedidos_sin_pago", { p_restaurante: restaurante }));
    expect((await leer(pedido)).status).toBe("CANCELLED");
  });

  it("permite pasar a Yape después de elegir caja y protege el pago pendiente", async () => {
    const pedido = await pedir(qrMostrador);
    const elegido = datos(await registrarEleccion(pedido, true)) as Estado;
    expect(datos(await registrarEleccion(pedido, false))).toMatchObject({ solicitado: false, limitePago: elegido.limitePago });
    const pago = datos(await caja.rpc("registrar_pago", {
      p_pedido_id: pedido.id, p_sesion_id: null, p_monto: 10, p_recibido: null, p_aprobado: null,
      p_metodo: "YAPE", p_referencia: "US150-YAPE", p_clave: randomUUID(),
    }).single<{ estado: string }>());
    expect(pago.estado).toBe("PENDING");
    expect((await registrarEleccion(pedido, true)).error?.message).toBe("PAYMENT_IN_PROGRESS");
    expect((await leer(pedido)).status).toBe("PENDING");
  });
});
