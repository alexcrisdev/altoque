import { StockPrueba } from "../soporte/stock-prueba";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// US-106: cada rol opera solo en su panel, también en la base (RPC y políticas).
// Recorre una mesa completa y prueba que cada rol ajeno recibe FORBIDDEN:
// abrir mesa → pedido asistido → cocina → entrega → cobro → incidencias → llamado → cierre.
// Usa la primera mesa libre y la deja cerrada al terminar, aunque una prueba falle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const restaurantId = "10000000-0000-0000-0000-000000000001";
const stockPrueba = new StockPrueba(restaurantId);
const motivo = "Prueba automática US-106: excepción autorizada";

type Rol = "dueno" | "admin" | "mesero" | "cocina" | "caja";
const correos: Record<Rol, string> = {
  dueno: "dueno@demo.altoque.pe", admin: "admin@demo.altoque.pe", mesero: "mesero@demo.altoque.pe",
  cocina: "cocina@demo.altoque.pe", caja: "caja@demo.altoque.pe",
};
const c = {} as Record<Rol, SupabaseClient>;
const ids = {} as Record<Rol, string>;
let servicio: SupabaseClient;
let mesa: { id: string; branch_id: string };
let productoId = "";
let sessionId: string | undefined;
let pedidoA: string | undefined; // recorre cocina → entrega
let pedidoB: string | undefined; // incidencias, modificación y cancelación como excepción

const ajenos = (...permitidos: Rol[]) => (Object.keys(correos) as Rol[]).filter((rol) => !permitidos.includes(rol));

async function iniciar(rol: Rol) {
  const cliente = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email: correos[rol], password: password! });
  if (error || !data.user) throw new Error(`No se pudo iniciar sesión como ${rol}`);
  c[rol] = cliente;
  ids[rol] = data.user.id;
}

function pedidoAsistido(cliente: SupabaseClient) {
  return cliente.rpc("registrar_pedido_mesero", {
    p_restaurant_id: restaurantId, p_modality: "DINE_IN", p_dining_table_id: mesa.id, p_branch_id: mesa.branch_id,
    p_idempotency_key: crypto.randomUUID(), p_items: [{ productoId, cantidad: 1, observacion: "Prueba US-106" }],
  }).single<{ pedido_id: string }>();
}
const estado = (cliente: SupabaseClient, pedido: string, nuevo: string, conMotivo: string | null = null) =>
  cliente.rpc("cambiar_estado_pedido", { p_pedido_id: pedido, p_estado: nuevo, p_motivo: conMotivo });
const pagar = (cliente: SupabaseClient, metodo: "CASH" | "YAPE") => cliente.rpc("registrar_pago", {
  p_sesion_id: sessionId, p_pedido_id: null, p_metodo: metodo, p_monto: "1.00",
  p_recibido: metodo === "CASH" ? "1.00" : null, p_referencia: metodo === "YAPE" ? "PRUEBA-US106" : null,
  p_aprobado: null, p_clave: crypto.randomUUID(),
}).single<{ pago_id: string; estado: string }>();
const cerrar = (cliente: SupabaseClient, conMotivo: string | null) =>
  cliente.rpc("cerrar_cuenta", { p_sesion_id: sessionId, p_pedido_id: null, p_motivo: conMotivo });
async function estadoActual(pedido: string) {
  const { data } = await servicio.from("orders").select("status").eq("id", pedido).single<{ status: string }>();
  return data?.status;
}

beforeAll(async () => {
  if (!url || !anonKey || !serviceKey || !password) throw new Error("Faltan variables de Supabase local");
  await Promise.all((Object.keys(correos) as Rol[]).map(iniciar));
  servicio = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [mesas, productos, abiertas] = await Promise.all([
    servicio.from("dining_tables").select("id, branch_id").eq("restaurant_id", restaurantId).eq("active", true).order("number"),
    servicio.from("products").select("id").eq("restaurant_id", restaurantId).eq("active", true).eq("available", true)
      .order("price").limit(1),
    servicio.from("table_sessions").select("dining_table_id").eq("restaurant_id", restaurantId).is("closed_at", null),
  ]);
  if (mesas.error || productos.error || abiertas.error) throw new Error("No se pudieron leer los datos demo");
  const ocupadas = new Set((abiertas.data ?? []).map((s) => s.dining_table_id));
  const libre = (mesas.data ?? []).find((fila) => !ocupadas.has(fila.id));
  if (!libre || !productos.data?.[0]) throw new Error("Se requiere una mesa libre y un producto activo");
  mesa = libre;
  productoId = productos.data[0].id;
  await stockPrueba.preparar(productoId, 3);
}, 30_000);

afterAll(async () => {
  const errores: string[] = [];
  try {
    // Deja todo como estaba: entrega lo listo, cancela lo activo y cierra la mesa.
    for (const pedido of [pedidoA, pedidoB]) {
      if (!pedido) continue;
      const actual = await estadoActual(pedido);
      const { error } = actual === "READY" ? await estado(c.mesero, pedido, "DELIVERED")
        : ["PENDING", "ACCEPTED", "IN_PROGRESS"].includes(actual ?? "") ? await estado(c.mesero, pedido, "CANCELLED", "Limpieza US-106")
        : { error: null };
      if (error) errores.push(`No se pudo limpiar el pedido: ${error.message}`);
    }
    if (sessionId) {
      const { data } = await servicio.from("table_sessions").select("id").eq("id", sessionId).is("closed_at", null).maybeSingle();
      if (data) {
        const liberar = await c.mesero.from("table_sessions").update({ closed_at: new Date().toISOString(), closed_by: ids.mesero })
          .eq("id", sessionId).is("closed_at", null);
        if (liberar.error) {
          const excepcion = await cerrar(c.admin, "Limpieza automática US-106 con saldo");
          if (excepcion.error) errores.push(`No se pudo cerrar la mesa de prueba: ${excepcion.error.message}`);
        }
      }
    }
  } finally {
    await stockPrueba.restaurar().catch((error) => errores.push(String(error)));
    await Promise.all(Object.values(c).map((cliente) => cliente.auth.signOut()));
  }
  if (errores.length) throw new Error(errores.join("; "));
}, 30_000);

describe("US-106: matriz de roles en la base", () => {
  it("abrir mesa: solo el mesero", async () => {
    for (const rol of ajenos("mesero")) {
      const { error } = await c[rol].from("table_sessions").insert({
        restaurant_id: restaurantId, branch_id: mesa.branch_id, dining_table_id: mesa.id, opened_by: ids[rol],
      });
      expect(error?.code, rol).toBe("42501");
    }
    const { data, error } = await c.mesero.from("table_sessions").insert({
      restaurant_id: restaurantId, branch_id: mesa.branch_id, dining_table_id: mesa.id, opened_by: ids.mesero,
    }).select("id").single();
    expect(error).toBeNull();
    sessionId = data!.id;
  });

  it("pedido asistido: solo el mesero", async () => {
    for (const rol of ajenos("mesero")) {
      expect((await pedidoAsistido(c[rol])).error?.message, rol).toContain("FORBIDDEN");
    }
    const [a, b] = await Promise.all([pedidoAsistido(c.mesero), pedidoAsistido(c.mesero)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    pedidoA = a.data!.pedido_id;
    pedidoB = b.data!.pedido_id;
    expect(await estadoActual(pedidoA)).toBe("IN_PROGRESS");
  });

  it("marcar listo y deshacer: solo cocina", async () => {
    for (const rol of ajenos("cocina")) {
      expect((await estado(c[rol], pedidoA!, "READY")).error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await estado(c.cocina, pedidoA!, "READY")).error).toBeNull();
    for (const rol of ajenos("cocina")) {
      expect((await estado(c[rol], pedidoA!, "IN_PROGRESS")).error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await estado(c.cocina, pedidoA!, "IN_PROGRESS")).error).toBeNull();
    expect((await estado(c.cocina, pedidoA!, "READY")).error).toBeNull();
  });

  it("entregar: solo el mesero (dueño y admin tampoco)", async () => {
    for (const rol of ajenos("mesero")) {
      expect((await estado(c[rol], pedidoA!, "DELIVERED")).error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await estado(c.mesero, pedidoA!, "DELIVERED")).error).toBeNull();
  });

  it("cobrar y verificar Yape: solo caja", async () => {
    for (const rol of ajenos("caja")) {
      expect((await pagar(c[rol], "CASH")).error?.message, rol).toContain("FORBIDDEN");
    }
    const yape = await pagar(c.caja, "YAPE");
    expect(yape.error).toBeNull();
    for (const rol of ajenos("caja")) {
      const { error } = await c[rol].rpc("verificar_pago", { p_pago_id: yape.data!.pago_id, p_confirmar: true });
      expect(error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await c.caja.rpc("verificar_pago", { p_pago_id: yape.data!.pago_id, p_confirmar: false })).error).toBeNull();
  });

  it("el mesero ya no lee pagos ni capturas; caja, dueño y admin sí", async () => {
    const leer = (cliente: SupabaseClient) => cliente.from("payments").select("id").eq("table_session_id", sessionId!);
    expect((await leer(c.mesero)).data).toEqual([]);
    for (const rol of ["caja", "dueno", "admin"] as Rol[]) expect((await leer(c[rol])).data?.length, rol).toBeGreaterThan(0);
  });

  it("incidencias: el mesero maneja reclamos; cocina, las de preparación; dueño y admin solo consultan", async () => {
    const registrar = (cliente: SupabaseClient, tipo: string) => cliente.rpc("registrar_incidencia", {
      p_pedido_id: pedidoB, p_tipo: tipo, p_descripcion: "Prueba US-106",
    });
    expect((await registrar(c.mesero, "SIN_INGREDIENTES")).error?.message).toContain("FORBIDDEN");
    expect((await registrar(c.cocina, "RECLAMO")).error?.message).toContain("FORBIDDEN");
    for (const rol of ["dueno", "admin", "caja"] as Rol[]) {
      expect((await registrar(c[rol], "OTRO")).error?.message, rol).toContain("FORBIDDEN");
    }
    const reclamo = await registrar(c.mesero, "RECLAMO");
    const preparacion = await registrar(c.cocina, "SIN_INGREDIENTES");
    expect(reclamo.error).toBeNull();
    expect(preparacion.error).toBeNull();
    const resolver = (cliente: SupabaseClient, id: unknown) => cliente.rpc("resolver_incidencia", { p_incidencia_id: id });
    expect((await resolver(c.cocina, reclamo.data)).error?.message).toContain("FORBIDDEN");
    expect((await resolver(c.mesero, preparacion.data)).error?.message).toContain("FORBIDDEN");
    expect((await resolver(c.dueno, reclamo.data)).error?.message).toContain("FORBIDDEN");
    expect((await resolver(c.mesero, reclamo.data)).error).toBeNull();
    expect((await resolver(c.cocina, preparacion.data)).error).toBeNull();
  });

  it("modificar un pedido pendiente es del mesero; dueño y admin cancelan como excepción con motivo", async () => {
    // Un pedido pendiente de pago (como los del QR) para probar la regla del mesero.
    expect((await servicio.from("orders").update({ status: "PENDING" }).eq("id", pedidoB!)).error).toBeNull();
    for (const rol of ["dueno", "admin", "caja", "cocina"] as Rol[]) {
      const { error } = await c[rol].rpc("modificar_pedido", { p_pedido_id: pedidoB, p_cambios: [], p_motivo: motivo });
      expect(error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await estado(c.admin, pedidoB!, "CANCELLED")).error?.message).toContain("REASON_REQUIRED");
    expect((await estado(c.cocina, pedidoB!, "CANCELLED", motivo)).error?.message).toContain("FORBIDDEN");
    expect((await estado(c.admin, pedidoB!, "CANCELLED", motivo)).error).toBeNull();
  });

  it("atender un llamado: solo el mesero", async () => {
    const { data: qr } = await servicio.from("qr_codes").select("id").eq("restaurant_id", restaurantId).limit(1).single();
    const { data: solicitud, error } = await servicio.from("help_requests")
      .insert({ qr_code_id: qr!.id, restaurant_id: restaurantId, branch_id: mesa.branch_id }).select("id").single();
    expect(error).toBeNull();
    for (const rol of ajenos("mesero")) {
      const atender = await c[rol].rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitud!.id });
      expect(atender.error?.message, rol).toContain("FORBIDDEN");
    }
    expect((await c.mesero.rpc("atender_solicitud_ayuda", { p_solicitud_id: solicitud!.id })).error).toBeNull();
  });

  it("cierre normal: solo caja; excepción con motivo: solo dueño y admin", async () => {
    for (const rol of ["mesero", "cocina", "dueno", "admin"] as Rol[]) {
      expect((await cerrar(c[rol], null)).error?.message, rol).toContain("FORBIDDEN");
    }
    // Caja pasa el permiso, pero la cuenta aún debe: no se cierra normal ni con excepción.
    expect((await cerrar(c.caja, null)).error?.message).toContain("SALDO_PENDIENTE");
    expect((await cerrar(c.caja, motivo)).error?.message).toContain("EXCEPTION_FORBIDDEN");
    expect((await cerrar(c.admin, motivo)).error).toBeNull();
    const { data } = await c.mesero.from("account_closures").select("id").eq("table_session_id", sessionId!);
    expect(data).toEqual([]);
  });
});
