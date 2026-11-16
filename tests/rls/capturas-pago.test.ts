import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = (() => { try { return !!url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname); } catch { return false; } })();
const restaurante = "10000000-0000-0000-0000-000000000001";
let admin: SupabaseClient, caja: SupabaseClient, ajeno: SupabaseClient, anon: SupabaseClient, mesero: SupabaseClient;
let usuario: string, sucursal: string, producto: string;
let original: { wallet_holder_name: string | null; prepay_dine_in: boolean } | undefined;
const cuentas: { sesion: string; pedido: string; mesa: string; qr: string }[] = [];
const rutas: string[] = [];
function exigir<T>({ data, error }: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (error || data == null) throw new Error(error?.message ?? "Sin datos"); return data;
}
async function crearCuenta() {
  const mesa = exigir(await admin.from("dining_tables").insert({ restaurant_id: restaurante, branch_id: sucursal, number: cuentas.length + 1, active: true }).select("id").single<{ id: string }>()).id as string;
  const sesion = exigir(await admin.from("table_sessions").insert({ restaurant_id: restaurante, branch_id: sucursal, dining_table_id: mesa, opened_by: usuario }).select("id").single<{ id: string }>()).id as string;
  const qr = exigir(await admin.from("qr_codes").insert({ restaurant_id: restaurante, branch_id: sucursal, dining_table_id: mesa, purpose: "DINE_IN", token_hash: (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "") }).select("id").single<{ id: string }>()).id as string;
  const registro = exigir(await admin.rpc("registrar_pedido_cliente", { p_qr_code_id: qr, p_idempotency_key: crypto.randomUUID(), p_items: [{ productoId: producto, cantidad: 1 }], p_modality: "DINE_IN", p_customer_name: null, p_customer_phone: null, p_alergia_respuesta: "NONE", p_alergenos: [], p_alergia_detalle: null }).single<{ pedido_id: string }>());
  const cuenta = { mesa, sesion, qr, pedido: registro.pedido_id as string }; cuentas.push(cuenta); return cuenta;
}
async function registrar(sesion: string, huella = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", ""), clave = crypto.randomUUID()) {
  const ruta = `${restaurante}/${crypto.randomUUID()}.jpg`; rutas.push(ruta);
  const subida = await admin.storage.from("capturas-pago").upload(ruta, new Uint8Array([255,216,255,224,0,0,255,217]), { contentType: "image/jpeg" });
  if (subida.error) throw subida.error;
  const parametros = { p_sesion_id: sesion, p_pedido_id: null, p_clave: clave, p_wallet: "PLIN", p_monto: 10, p_storage_path: ruta, p_sha256: huella };
  const fila = exigir(await admin.rpc("registrar_pago_captura", parametros).single<{ captura_id: string }>());
  return { id: fila.captura_id as string, ruta, parametros };
}
async function estadoPedido(id: string) {
  return exigir(await admin.from("orders").select("status").eq("id",id).single<{ status: string }>()).status;
}
async function verificar(id: string, resultado: string, monto: number | null = null) {
  return caja.rpc("verificar_pago_captura", { p_captura_id: id, p_resultado: resultado, p_monto_recibido: monto,
    p_motivo: resultado === "NOT_RECEIVED" ? "No figura el ingreso en la billetera" : null });
}

// Nunca ejecuta escrituras en Supabase compartido, incluso si el runner carga sus variables.
describe.skipIf(!local)("US-102: capturas, RLS y US-094 (solo Supabase local)", () => {
  beforeAll(async () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: publica, SUPABASE_SERVICE_ROLE_KEY: servicio, DEMO_PASSWORD: password } = process.env;
    if (!publica || !servicio || !password) throw new Error("Falta configuración local.");
    const cliente = (key: string) => createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    admin = cliente(servicio); anon = cliente(publica);
    async function iniciar(email: string) {
      const c = cliente(publica!); const { error } = await c.auth.signInWithPassword({ email, password: password! });
      if (error) throw error; return c;
    }
    caja = await iniciar("caja@demo.altoque.pe"); ajeno = await iniciar("dueno@polleria.demo"); mesero = await iniciar("mesero@demo.altoque.pe");
    usuario = (await caja.auth.getUser()).data.user!.id;
    original = exigir(await admin.from("restaurants").select("wallet_holder_name,prepay_dine_in").eq("id",restaurante).single());
    const cambio = await admin.from("restaurants").update({ wallet_holder_name: "Titular prueba local", prepay_dine_in: true }).eq("id",restaurante);
    if (cambio.error) throw cambio.error;
    sucursal = exigir(await admin.from("branches").insert({ restaurant_id: restaurante, name: `US-102 ${crypto.randomUUID()}`, active: true }).select("id").single<{ id: string }>()).id;
    const categoria = exigir(await admin.from("categories").select("id").eq("restaurant_id",restaurante).limit(1).single<{ id: string }>()).id;
    producto = exigir(await admin.from("products").insert({ restaurant_id: restaurante, category_id: categoria, name: `US-102 ${crypto.randomUUID()}`, price: 10, active: true, available: true }).select("id").single<{ id: string }>()).id;
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const stock = await admin.from("product_daily_stock").insert({ restaurant_id: restaurante, product_id: producto, stock_date: fecha, quantity: 100, sold: 0 });
    if (stock.error) throw stock.error;
  }, 30000);
  afterAll(async () => {
    if (!admin) return;
    const errores: string[] = [];
    const revisar = (r: { error: { message: string } | null }) => { if (r.error) errores.push(r.error.message); };
    if (rutas.length) revisar(await admin.storage.from("capturas-pago").remove(rutas));
    for (const c of cuentas) {
      revisar(await admin.from("receipts").delete().eq("table_session_id",c.sesion));
      revisar(await admin.from("payments").delete().eq("table_session_id",c.sesion));
      revisar(await admin.from("order_items").delete().eq("order_id",c.pedido));
      revisar(await admin.from("orders").delete().eq("id",c.pedido));
      revisar(await admin.from("qr_codes").delete().eq("id",c.qr));
      revisar(await admin.from("table_sessions").delete().eq("id",c.sesion));
      revisar(await admin.from("dining_tables").delete().eq("id",c.mesa));
    }
    if (producto) {
      revisar(await admin.from("product_daily_stock").delete().eq("product_id",producto));
      revisar(await admin.from("products").delete().eq("id",producto));
    }
    if (sucursal) revisar(await admin.from("branches").delete().eq("id",sucursal));
    if (original) revisar(await admin.from("restaurants").update(original).eq("id",restaurante));
    await Promise.all([caja,ajeno,mesero].filter(Boolean).map(c => c.auth.signOut()));
    if (errores.length) throw new Error(errores.join("\n"));
  }, 30000);

  it("otro restaurante no lee la fila ni descarga la imagen; mesero ve la fila pero no firma", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    expect(exigir(await ajeno.from("payment_proofs").select("id").eq("id",c.id))).toEqual([]);
    expect(exigir(await mesero.from("payment_proofs").select("id").eq("id",c.id))).toEqual([{ id: c.id }]);
    expect((await anon.storage.from("capturas-pago").download(c.ruta)).error).not.toBeNull();
    expect((await ajeno.storage.from("capturas-pago").download(c.ruta)).error).not.toBeNull();
    expect((await mesero.storage.from("capturas-pago").createSignedUrl(c.ruta,60)).error).not.toBeNull();
    expect((await ajeno.rpc("verificar_pago_captura", { p_captura_id: c.id, p_resultado: "COMPLETE", p_monto_recibido: null })).error).not.toBeNull();
  });
  it("No llegó deja FAILED y el pedido no sale de PENDING", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    expect(await estadoPedido(cuenta.pedido)).toBe("PENDING"); exigir(await verificar(c.id,"NOT_RECEIVED"));
    expect(await estadoPedido(cuenta.pedido)).toBe("PENDING");
    expect(exigir(await admin.from("payments").select("status").eq("payment_proof_id",c.id).single<{ status: string }>()).status).toBe("FAILED");
  });
  it("otro monto deja saldo pendiente y no inicia cocina", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    exigir(await verificar(c.id,"OTHER",4));
    expect(Number(exigir(await admin.rpc("saldo_cuenta_online", { p_sesion_id: cuenta.sesion, p_pedido_id: null })))).toBe(6);
    expect(await estadoPedido(cuenta.pedido)).toBe("PENDING");
  });
  it("pago completo inicia cocina con US-094 y registra quién confirmó", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion); exigir(await verificar(c.id,"COMPLETE"));
    expect(await estadoPedido(cuenta.pedido)).toBe("IN_PROGRESS");
    expect(exigir(await admin.from("payment_proofs").select("status,verified_by,verified_at").eq("id",c.id).single())).toMatchObject({ status: "CONFIRMED", verified_by: usuario, verified_at: expect.any(String) });
  });
  it("dos confirmaciones concurrentes solo producen una confirmación", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    const respuestas = await Promise.all([verificar(c.id,"COMPLETE"),verificar(c.id,"COMPLETE")]);
    expect(respuestas.filter(r => !r.error)).toHaveLength(1);
    expect(respuestas.filter(r => r.error?.message.includes("ALREADY_VERIFIED"))).toHaveLength(1);
  });
  it("el RPC manual no puede confirmar una captura", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    const pago = exigir(await admin.from("payment_proofs").select("payment_id").eq("id",c.id).single<{ payment_id: string }>()).payment_id;
    expect((await caja.rpc("verificar_pago", { p_pago_id: pago, p_confirmar: true })).error?.message).toContain("USE_PROOF_VERIFICATION");
    expect(await estadoPedido(cuenta.pedido)).toBe("PENDING");
  });
  it("reintento devuelve la misma captura y una huella repetida advierte sin bloquear", async () => {
    const cuenta = await crearCuenta(), hash = "b".repeat(64), c = await registrar(cuenta.sesion,hash);
    const repetida = exigir(await admin.rpc("registrar_pago_captura", c.parametros).single<{ captura_id: string }>());
    expect(repetida.captura_id).toBe(c.id);
    const otra = await registrar(cuenta.sesion,hash);
    expect(exigir(await admin.from("payment_proofs").select("duplicate").eq("id",otra.id).single<{ duplicate: boolean }>()).duplicate).toBe(true);
  });
  it("anon y authenticated no pueden registrar por RPC ni insertar filas", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    expect((await anon.rpc("registrar_pago_captura",c.parametros)).error).not.toBeNull();
    expect((await caja.rpc("registrar_pago_captura",c.parametros)).error).not.toBeNull();
    expect((await caja.from("payment_proofs").insert({})).error).not.toBeNull();
  });
  it("el rechazo exige motivo y lo conserva para auditoría", async () => {
    const cuenta = await crearCuenta(), c = await registrar(cuenta.sesion);
    expect((await caja.rpc("verificar_pago_captura", { p_captura_id: c.id, p_resultado: "NOT_RECEIVED", p_monto_recibido: null, p_motivo: " " })).error?.message).toContain("REJECTION_REASON_REQUIRED");
    exigir(await verificar(c.id,"NOT_RECEIVED"));
    expect(exigir(await admin.from("payment_proofs").select("rejection_reason").eq("id",c.id).single<{ rejection_reason: string }>()).rejection_reason).toBe("No figura el ingreso en la billetera");
  });
  it("la misma imagen no se aprueba simultáneamente para dos cuentas", async () => {
    const primera = await crearCuenta(), segunda = await crearCuenta();
    const huella = "e".repeat(64), a = await registrar(primera.sesion,huella), b = await registrar(segunda.sesion,huella);
    const respuestas = await Promise.all([verificar(a.id,"COMPLETE"),verificar(b.id,"COMPLETE")]);
    expect(respuestas.filter(r => !r.error)).toHaveLength(1);
    expect(respuestas.filter(r => r.error?.message.includes("PROOF_ALREADY_USED"))).toHaveLength(1);
    const estados = await Promise.all([estadoPedido(primera.pedido),estadoPedido(segunda.pedido)]);
    expect(estados.sort()).toEqual(["IN_PROGRESS","PENDING"]);
  });
});
