import "server-only";
import { randomUUID } from "node:crypto";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { crearClienteServidor } from "../../lib/supabase/server";
import { inicioDiaLima, type Billetera, type CapturaPendiente, type ResultadoCaptura } from "./capturas-logica";
import type { CuentaOnline } from "./pago-online";
import type { CuentaACobrar } from "./pago-logica";

const BUCKET = "capturas-pago";
export async function titularBilletera(restauranteId: string) {
  const { data, error } = await crearClienteAdmin().from("restaurants").select("wallet_holder_name").eq("id", restauranteId).single();
  if (error) throw new Error("No se pudo consultar el titular.");
  return (data.wallet_holder_name as string | null)?.trim() || null;
}

export async function guardarCaptura(cuenta: CuentaOnline, datos: {
  clave: string; wallet: Billetera; monto: number; huella: string; imagen: Uint8Array; tipo: string;
}) {
  const admin = crearClienteAdmin();
  const ruta = `${cuenta.restauranteId}/${randomUUID()}.jpg`;
  const { error: subida } = await admin.storage.from(BUCKET).upload(ruta, datos.imagen, { contentType: datos.tipo, upsert: false });
  if (subida) throw new Error("No pudimos subir la captura.");
  const { data, error } = await admin.rpc("registrar_pago_captura", {
    p_sesion_id: cuenta.cuenta.tipo === "MESA" ? cuenta.cuenta.id : null,
    p_pedido_id: cuenta.cuenta.tipo === "PARA_LLEVAR" ? cuenta.cuenta.id : null,
    p_clave: datos.clave, p_wallet: datos.wallet, p_monto: (datos.monto / 100).toFixed(2),
    p_storage_path: ruta, p_sha256: datos.huella,
  });
  const fila = (Array.isArray(data) ? data[0] : data) as { captura_id: string; ruta_guardada: string } | null;
  let borrarSobrante = !!fila && fila.ruta_guardada !== ruta;
  if (error || !fila) {
    // Una respuesta perdida no prueba que la transacción falló: no borrar una foto registrada.
    const comprobacion = await admin.from("payment_proofs").select("id").eq("restaurant_id", cuenta.restauranteId).eq("storage_path", ruta).maybeSingle();
    // Solo un error SQL explícito garantiza rollback. Un timeout puede dejar la
    // transacción todavía en curso; el barrido de huérfanos resolverá ese archivo.
    borrarSobrante = !!error && /^[0-9A-Z]{5}$/.test(error.code ?? "") && !comprobacion.error && !comprobacion.data;
  }
  if (borrarSobrante) {
    const { error: borrado } = await admin.storage.from(BUCKET).remove([ruta]);
    if (borrado) console.error("US-102: archivo sobrante pendiente de limpieza", borrado.name);
  }
  // US-105: máximo 3 capturas por verificar en la misma cuenta.
  if (error?.message === "TOO_MANY_PENDING_PROOFS") {
    throw new Error("Ya hay 3 capturas esperando que caja las revise. Espera a que las verifique antes de subir otra.");
  }
  if (error || !fila) throw new Error("No se pudo registrar. Reintenta con la misma captura; no confirmes otro pago.");
  return fila.captura_id;
}

type FilaCaptura = {
  id: string; wallet: Billetera; expected_amount: number; declared_amount: number;
  created_at: string; duplicate: boolean; deleted_at: string | null;
  table_session_id?: string | null; order_id?: string | null;
  table_sessions: { dining_tables: { number: number } | null } | null;
  orders: { order_number: number; daily_number?: number | null; business_date?: string | null } | null;
};

// US-105: saldo actual de cada cuenta con capturas, para ver el excedente antes de confirmar.
// Si no se puede consultar, la captura se muestra igual (la base vuelve a validar al confirmar).
async function saldosActuales(db: Awaited<ReturnType<typeof crearClienteServidor>>, filas: FilaCaptura[]) {
  const saldos = new Map<string, number | null>();
  for (const fila of filas) {
    const clave = `${fila.table_session_id ?? ""}|${fila.order_id ?? ""}`;
    if (saldos.has(clave) || (!fila.table_session_id && !fila.order_id)) continue;
    const { data, error } = await db.rpc("saldo_cuenta_caja", {
      p_sesion_id: fila.table_session_id ?? null, p_pedido_id: fila.table_session_id ? null : fila.order_id ?? null,
    });
    saldos.set(clave, error || data === null || data === undefined ? null : Math.round(Number(data) * 100));
  }
  return (fila: FilaCaptura) => saldos.get(`${fila.table_session_id ?? ""}|${fila.order_id ?? ""}`) ?? null;
}

function tituloPedido(pedido: FilaCaptura["orders"]) {
  if (!pedido) return "Pedido N.º ?";
  return pedido.daily_number ? `Pedido N.º ${pedido.daily_number}` : `Pedido #${pedido.order_number}`;
}
export async function listarCapturas(restauranteId: string): Promise<CapturaPendiente[]> {
  const db = await crearClienteServidor();
  const resultado: CapturaPendiente[] = [];
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await db.from("payment_proofs")
      .select("id,wallet,expected_amount,declared_amount,created_at,duplicate,deleted_at,table_session_id,order_id,table_sessions(dining_tables(number)),orders(order_number,daily_number,business_date)")
      .eq("restaurant_id", restauranteId).eq("status", "PENDING").order("created_at").order("id").range(desde, desde + 499)
      .overrideTypes<FilaCaptura[], { merge: false }>();
    if (error) throw new Error("No se pudieron cargar las capturas.");
    const saldoDe = await saldosActuales(db, data);
    resultado.push(...data.map(c => ({ id: c.id, wallet: c.wallet, esperado: Math.round(Number(c.expected_amount) * 100),
      declarado: Math.round(Number(c.declared_amount) * 100), creadaEn: c.created_at, duplicada: c.duplicate, eliminada: c.deleted_at !== null,
      saldoActual: saldoDe(c),
      titulo: c.table_sessions ? `Mesa ${c.table_sessions.dining_tables?.number ?? "?"}` : tituloPedido(c.orders) })));
    if (data.length < 500) return resultado;
  }
}

// El llamador comprueba CASHIER/OWNER/ADMIN; esta consulta además limita restaurante.
export async function firmarCaptura(restauranteId: string, id: string) {
  const admin = crearClienteAdmin();
  const { data, error } = await admin.from("payment_proofs").select("storage_path,created_at")
    .eq("restaurant_id", restauranteId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error || !data || Date.parse(data.created_at) + 86400_000 <= Date.now()) return null;
  const { data: firma, error: fallo } = await admin.storage.from(BUCKET).createSignedUrl(data.storage_path, 60);
  if (fallo) throw new Error("No se pudo abrir la captura.");
  return firma.signedUrl;
}
export async function verificarCaptura(id: string, resultado: ResultadoCaptura, monto: number | null, motivo: string | null = null) {
  const db = await crearClienteServidor();
  const { data, error } = await db.rpc("verificar_pago_captura", {
    p_captura_id: id, p_resultado: resultado, p_monto_recibido: monto === null ? null : (monto / 100).toFixed(2),
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message === "ALREADY_VERIFIED" ? "Otro cajero ya verificó este pago."
    : error.message === "PROOF_ALREADY_USED" ? "Esta imagen ya respaldó otro pago confirmado. No se puede aprobar otra vez."
    : "No se pudo verificar. Comprueba el saldo y vuelve a intentar.");
  return data as string;
}

export async function totalBilleteraHoy(restauranteId: string) {
  const db = await crearClienteServidor();
  let total = 0;
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await db.from("payments").select("amount").eq("restaurant_id", restauranteId)
      .eq("method", "YAPE").eq("status", "CONFIRMED").gte("confirmed_at", inicioDiaLima())
      .order("id").range(desde, desde + 499);
    if (error) throw new Error("No se pudo consultar el total de Yape/Plin.");
    total += data.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
    if (data.length < 500) return total;
  }
}

// Storage y SQL no comparten transacción: marcar solo después del borrado permite reintentar.
export async function limpiarCapturas(restauranteId?: string, cuenta?: CuentaACobrar) {
  const admin = crearClienteAdmin();
  let ultimoId: string | null = null;
  let eliminadas = 0;
  for (;;) {
    let consulta = admin.from("payment_proofs").select("id,storage_path,created_at,table_session_id,order_id,restaurant_id")
      .is("deleted_at", null).order("id").limit(500);
    if (restauranteId) consulta = consulta.eq("restaurant_id", restauranteId);
    if (cuenta) consulta = consulta.eq(cuenta.tipo === "MESA" ? "table_session_id" : "order_id", cuenta.id);
    if (ultimoId) consulta = consulta.gt("id", ultimoId);
    const { data, error } = await consulta;
    if (error) throw new Error("No se pudo consultar la limpieza de capturas.");
    for (const fila of data) {
      let borrar = Date.parse(fila.created_at) + 86400_000 <= Date.now();
      if (!borrar) {
        const { data: cierre, error: errorCierre } = await admin.from("account_closures").select("id")
          .eq("restaurant_id", fila.restaurant_id)
          .eq(fila.table_session_id ? "table_session_id" : "order_id", fila.table_session_id ?? fila.order_id).maybeSingle();
        if (errorCierre) throw new Error("No se pudo comprobar el cierre.");
        borrar = !!cierre;
      }
      if (!borrar) continue;
      const { error: fallo } = await admin.storage.from(BUCKET).remove([fila.storage_path]);
      if (fallo) throw new Error("No se pudo eliminar una captura; se reintentará.");
      const { error: marcado } = await admin.from("payment_proofs").update({ deleted_at: new Date().toISOString() }).eq("id", fila.id).eq("restaurant_id", fila.restaurant_id);
      if (marcado) throw new Error("No se pudo registrar la eliminación; se reintentará.");
      eliminadas++;
    }
    if (data.length < 500) return eliminadas;
    ultimoId = data[data.length - 1].id;
  }
}

// Cubre subidas sin fila cuando una caída impide la compensación inmediata.
// Solo se ejecuta desde el trabajo autenticado, nunca desde el cliente QR.
export async function limpiarArchivosHuerfanos() {
  const admin = crearClienteAdmin();
  const bucket = admin.storage.from(BUCKET);
  let borrados = 0;
  const nombres: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const carpetas = await bucket.list("", { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (carpetas.error) throw new Error("No se pudo consultar Storage.");
    nombres.push(...carpetas.data.map(c => c.name).filter(n => /^[a-f0-9-]{36}$/.test(n)));
    if (carpetas.data.length < 100) break;
  }
  // Obtener los nombres antes de borrar: una carpeta vacía desaparece de la lista.
  for (const nombre of nombres) {
      let posicion = 0;
      for (;;) {
        const archivos = await bucket.list(nombre, { limit: 100, offset: posicion, sortBy: { column: "name", order: "asc" } });
        if (archivos.error) throw new Error("No se pudo consultar una carpeta de capturas.");
        let eliminadosPagina = 0;
        for (const archivo of archivos.data) {
          if (!archivo.created_at || Date.parse(archivo.created_at) + 86400_000 > Date.now()) continue;
          const ruta = `${nombre}/${archivo.name}`;
          const { data, error } = await admin.from("payment_proofs").select("id").eq("restaurant_id", nombre).eq("storage_path", ruta).maybeSingle();
          if (error) throw new Error("No se pudo comprobar el registro de la captura.");
          if (data) continue;
          const eliminado = await bucket.remove([ruta]);
          if (eliminado.error) throw new Error("No se pudo eliminar un archivo sobrante.");
          eliminadosPagina++; borrados++;
        }
        if (archivos.data.length < 100) break;
        posicion += archivos.data.length - eliminadosPagina;
      }
  }
  return borrados;
}
