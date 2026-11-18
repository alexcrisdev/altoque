import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { rangoLimaAUtc } from "./ventas-logica";
import {
  calcularTiemposEtapas,
  construirActividad,
  type Actividad,
  type EventoEstadoPedido,
  type FilaCierre,
  type FilaHistorial,
  type FilaPago,
  type TiempoEtapa,
} from "./actividad-logica";

export type ActividadDia = { tiempos: TiempoEtapa[] | null; registro: Actividad[] | null };

type Nombre = { full_name: string } | null;
type Cuenta = { table_sessions: { dining_tables: { number: number } | null } | null; orders: { order_number: number } | null };

const LIMITE_REGISTRO = 300;

function textoCuenta(fila: Cuenta): string {
  const mesa = fila.table_sessions?.dining_tables?.number;
  if (mesa !== undefined) return `Mesa ${mesa}`;
  const numero = fila.orders?.order_number;
  return numero !== undefined ? `Para llevar N.º ${numero}` : "Cuenta";
}

async function tiemposDelDia(restauranteId: string, desdeUtc: string, hastaUtc: string) {
  const supabase = await crearClienteServidor();
  const pedidos = await supabase.from("orders").select("id")
    .eq("restaurant_id", restauranteId).eq("status", "DELIVERED")
    .gte("created_at", desdeUtc).lt("created_at", hastaUtc).limit(1000)
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (pedidos.error) throw new Error("tiempos:pedidos");
  const ids = pedidos.data.map((p) => p.id);
  const eventos: EventoEstadoPedido[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = await supabase.from("order_status_history")
      .select("order_id, from_status, to_status, event, created_at")
      .eq("restaurant_id", restauranteId).eq("event", "STATUS").in("order_id", ids.slice(i, i + 100))
      .overrideTypes<EventoEstadoPedido[], { merge: false }>();
    if (lote.error) throw new Error("tiempos:historial");
    eventos.push(...lote.data);
  }
  return calcularTiemposEtapas(eventos);
}

async function registroDelDia(restauranteId: string, desdeUtc: string, hastaUtc: string) {
  const supabase = await crearClienteServidor();
  // Solo columnas necesarias: nada de teléfonos, correos, comprobantes ni datos de tarjeta.
  const [historial, pagos, cierres] = await Promise.all([
    supabase.from("order_status_history")
      .select("id, from_status, to_status, event, reason, created_at, users(full_name), orders(order_number)")
      .eq("restaurant_id", restauranteId).gte("created_at", desdeUtc).lt("created_at", hastaUtc)
      .order("created_at", { ascending: false }).limit(LIMITE_REGISTRO)
      .overrideTypes<(Omit<FilaHistorial, "persona" | "numero"> & {
        users: Nombre; orders: { order_number: number } | null;
      })[], { merge: false }>(),
    supabase.from("payments")
      .select(`id, method, status, amount, created_at,
        registro:users!payments_created_by_fkey(full_name),
        verificacion:users!payments_verified_by_fkey(full_name),
        table_sessions(dining_tables(number)), orders(order_number)`)
      .eq("restaurant_id", restauranteId).gte("created_at", desdeUtc).lt("created_at", hastaUtc)
      .order("created_at", { ascending: false }).limit(LIMITE_REGISTRO)
      .overrideTypes<(Omit<FilaPago, "registradoPor" | "verificadoPor" | "cuenta"> & Cuenta & {
        registro: Nombre; verificacion: Nombre;
      })[], { merge: false }>(),
    supabase.from("account_closures")
      .select(`id, kind, reason, balance, closed_at,
        users!account_closures_closed_by_fkey(full_name),
        table_sessions(dining_tables(number)), orders(order_number)`)
      .eq("restaurant_id", restauranteId).gte("closed_at", desdeUtc).lt("closed_at", hastaUtc)
      .order("closed_at", { ascending: false }).limit(LIMITE_REGISTRO)
      .overrideTypes<(Omit<FilaCierre, "persona" | "cuenta"> & Cuenta & { users: Nombre })[], { merge: false }>(),
  ]);
  if (historial.error) console.error("actividad:historial", historial.error.code);
  if (pagos.error) console.error("actividad:pagos", pagos.error.code);
  if (cierres.error) console.error("actividad:cierres", cierres.error.code);
  if (historial.error || pagos.error || cierres.error) throw new Error("registro");

  return construirActividad(
    historial.data.map((h) => ({
      id: h.id, from_status: h.from_status, to_status: h.to_status, event: h.event, reason: h.reason,
      created_at: h.created_at, persona: h.users?.full_name ?? null, numero: h.orders?.order_number ?? null,
    })),
    pagos.data.map((p) => ({
      id: p.id, method: p.method, status: p.status, amount: p.amount, created_at: p.created_at,
      registradoPor: p.registro?.full_name ?? null, verificadoPor: p.verificacion?.full_name ?? null,
      cuenta: textoCuenta(p),
    })),
    cierres.data.map((c) => ({
      id: c.id, kind: c.kind, reason: c.reason, balance: c.balance, closed_at: c.closed_at,
      persona: c.users?.full_name ?? null, cuenta: textoCuenta(c),
    })),
  ).slice(0, LIMITE_REGISTRO);
}

export async function obtenerActividadDia(restauranteId: string, fecha: string): Promise<ActividadDia> {
  if (!restauranteId.trim()) throw new Error("Restaurante inválido.");
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(fecha, fecha);
  const [tiempos, registro] = await Promise.all([
    tiemposDelDia(restauranteId, desdeUtc, hastaUtcExclusivo).catch(() => null),
    registroDelDia(restauranteId, desdeUtc, hastaUtcExclusivo).catch(() => null),
  ]);
  return { tiempos, registro };
}
