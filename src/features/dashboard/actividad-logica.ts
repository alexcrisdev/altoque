// US-099 (Parte 2b): tiempos por etapa y registro de actividad del día.
// Lógica pura con imports relativos (pruebas unitarias).

export type EventoEstadoPedido = {
  order_id: string;
  from_status: string | null;
  to_status: string;
  event: string;
  created_at: string;
};

export type Etapa = "PAGO" | "COCINA" | "ENTREGA" | "TOTAL";

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  PAGO: "Espera de pago",
  COCINA: "Cocina",
  ENTREGA: "Entrega",
  TOTAL: "Total (pedido → entregado)",
};

export type TiempoEtapa = { etapa: Etapa; pedidos: number; promedioMs: number; medianaMs: number };

export function mediana(valores: readonly number[]): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * Tiempos por etapa, solo de pedidos completos (con DELIVERED) y eventos STATUS:
 * - Pago: PENDING → primer IN_PROGRESS (solo pedidos que esperaron pago).
 * - Cocina: primer IN_PROGRESS → último READY.
 * - Entrega: último READY → DELIVERED.
 * - Total: primer evento (creación) → DELIVERED.
 * Un tramo negativo o con fechas inválidas se descarta.
 */
export function calcularTiemposEtapas(eventos: readonly EventoEstadoPedido[]): TiempoEtapa[] {
  const porPedido = new Map<string, { estado: string; desde: string | null; ms: number }[]>();
  for (const e of eventos) {
    if (e.event !== "STATUS") continue;
    const ms = Date.parse(e.created_at);
    if (!Number.isFinite(ms)) continue;
    const lista = porPedido.get(e.order_id) ?? [];
    lista.push({ estado: e.to_status, desde: e.from_status, ms });
    porPedido.set(e.order_id, lista);
  }

  const tramos: Record<Etapa, number[]> = { PAGO: [], COCINA: [], ENTREGA: [], TOTAL: [] };
  const agregar = (etapa: Etapa, inicio: number | undefined, fin: number | undefined) => {
    if (inicio === undefined || fin === undefined || fin < inicio) return;
    tramos[etapa].push(fin - inicio);
  };

  for (const lista of porPedido.values()) {
    lista.sort((a, b) => a.ms - b.ms);
    const entregado = lista.findLast((e) => e.estado === "DELIVERED")?.ms;
    if (entregado === undefined) continue; // solo pedidos completos
    const creado = lista[0].ms;
    const pendiente = lista.find((e) => e.estado === "PENDING")?.ms;
    const enCocina = lista.find((e) => e.estado === "IN_PROGRESS")?.ms;
    const listo = lista.findLast((e) => e.estado === "READY")?.ms;
    if (pendiente !== undefined) agregar("PAGO", pendiente, enCocina);
    agregar("COCINA", enCocina, listo);
    agregar("ENTREGA", listo, entregado);
    agregar("TOTAL", creado, entregado);
  }

  return (Object.keys(tramos) as Etapa[]).map((etapa) => {
    const valores = tramos[etapa];
    return {
      etapa,
      pedidos: valores.length,
      promedioMs: valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0,
      medianaMs: mediana(valores),
    };
  });
}

/** "12 min", "45 s", "1 h 05 min". */
export function formatoDuracion(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`;
}

// ---------- Registro de actividad ----------

export type TipoActividad = "PEDIDO" | "PAGO" | "CIERRE";

export type Actividad = {
  id: string;
  en: string;
  tipo: TipoActividad;
  persona: string;
  que: string;
  detalle: string;
  /** Cancelaciones, cierres con excepción y pagos rechazados. */
  resaltar: boolean;
};

const ESTADO: Record<string, string> = {
  PENDING: "Esperando pago",
  ACCEPTED: "Aceptado",
  IN_PROGRESS: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};
const METODO: Record<string, string> = { CASH: "Efectivo", YAPE: "Yape", CARD: "Tarjeta" };
const soles = (monto: number | string) => `S/ ${Number(monto).toFixed(2)}`;

export type FilaHistorial = {
  id: string;
  from_status: string | null;
  to_status: string;
  event: string;
  reason: string | null;
  created_at: string;
  persona: string | null;
  numero: number | null;
};

export type FilaPago = {
  id: string;
  method: string;
  status: string;
  amount: number | string;
  created_at: string;
  registradoPor: string | null;
  verificadoPor: string | null;
  cuenta: string;
};

export type FilaCierre = {
  id: string;
  kind: string;
  reason: string | null;
  balance: number | string;
  closed_at: string;
  persona: string | null;
  cuenta: string;
};

/**
 * Une historial, pagos y cierres en una sola lista (más reciente primero).
 * Solo usa nombres del personal: nunca teléfonos, correos ni datos de tarjeta (US-028).
 */
export function construirActividad(
  historial: readonly FilaHistorial[],
  pagos: readonly FilaPago[],
  cierres: readonly FilaCierre[],
): Actividad[] {
  const lista: Actividad[] = [];

  for (const h of historial) {
    const pedido = h.numero !== null ? `Pedido N.º ${h.numero}` : "Pedido";
    const modificado = h.event === "MODIFIED";
    const cancelado = h.to_status === "CANCELLED";
    lista.push({
      id: `h:${h.id}`,
      en: h.created_at,
      tipo: "PEDIDO",
      persona: h.persona ?? (h.from_status === null ? "Cliente (QR)" : "Sistema"),
      que: modificado
        ? `${pedido} modificado`
        : h.from_status === null
          ? `${pedido} creado`
          : `${pedido}: ${ESTADO[h.from_status] ?? h.from_status} → ${ESTADO[h.to_status] ?? h.to_status}`,
      detalle: cancelado || modificado ? (h.reason?.trim() || "Sin motivo registrado") : "",
      resaltar: cancelado,
    });
  }

  for (const p of pagos) {
    const rechazado = p.status === "FAILED";
    const estado = p.status === "CONFIRMED" ? "confirmado" : rechazado ? "rechazado" : "pendiente";
    lista.push({
      id: `p:${p.id}`,
      en: p.created_at,
      tipo: "PAGO",
      persona: p.verificadoPor ?? p.registradoPor ?? "Cliente (en línea)",
      que: `Pago ${estado} · ${METODO[p.method] ?? p.method} ${soles(p.amount)}`,
      detalle: [
        p.cuenta,
        p.registradoPor ? `registrado por ${p.registradoPor}` : null,
        p.verificadoPor ? `verificado por ${p.verificadoPor}` : null,
      ].filter(Boolean).join(" · "),
      resaltar: rechazado,
    });
  }

  for (const c of cierres) {
    const excepcion = c.kind === "EXCEPTION";
    lista.push({
      id: `c:${c.id}`,
      en: c.closed_at,
      tipo: "CIERRE",
      persona: c.persona ?? "Personal",
      que: excepcion ? `Cierre con excepción · ${c.cuenta}` : `Cierre ordinario · ${c.cuenta}`,
      detalle: excepcion
        ? `Saldo ${soles(c.balance)} · ${c.reason?.trim() || "Sin motivo registrado"}`
        : "",
      resaltar: excepcion,
    });
  }

  return lista.sort((a, b) => Date.parse(b.en) - Date.parse(a.en) || a.id.localeCompare(b.id));
}

export function filtrarActividad(
  lista: readonly Actividad[],
  tipo: TipoActividad | "TODOS",
  persona: string | "TODAS",
): Actividad[] {
  return lista.filter((a) => (tipo === "TODOS" || a.tipo === tipo) && (persona === "TODAS" || a.persona === persona));
}

export function personasDeActividad(lista: readonly Actividad[]): string[] {
  return [...new Set(lista.map((a) => a.persona))].sort((a, b) => a.localeCompare(b, "es"));
}
