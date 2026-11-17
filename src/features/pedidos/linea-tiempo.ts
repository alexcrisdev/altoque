// US-092: línea de tiempo del pedido para el cliente (lógica pura, sin base de datos).
// Imports relativos: las pruebas unitarias importan este archivo.
import type { EstadoPedido } from "./estados";

// Solo lo que el navegador necesita: de dónde a dónde cambió y cuándo.
// Nunca quién lo cambió ni el motivo interno.
export type EventoEstado = {
  desde: EstadoPedido | null;
  hacia: EstadoPedido;
  creadoEn: string;
};

export type ClavePaso =
  | "ENVIADO"
  | "PAGADO"
  | "EN_COCINA"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADO";

export type PasoLineaTiempo = {
  clave: ClavePaso;
  etiqueta: string;
  /** Hora HH:MM en Lima, o null si el paso aún no ocurre o no quedó registrado. */
  hora: string | null;
  estado: "hecho" | "actual" | "pendiente";
};

const ETIQUETA_PASO: Record<ClavePaso, string> = {
  ENVIADO: "Pedido enviado",
  PAGADO: "Pago confirmado",
  EN_COCINA: "En cocina",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const formatoHora = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatearHoraLima(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return formatoHora.format(new Date(ms));
}

function ordenar(eventos: readonly EventoEstado[]): EventoEstado[] {
  return eventos
    .filter((evento) => Number.isFinite(Date.parse(evento.creadoEn)))
    .sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn));
}

/**
 * Arma los pasos Enviado → Pagado → En cocina → Listo → Entregado.
 * - "Pagado" solo aparece si el pedido nació esperando pago (PENDING);
 *   su hora es el paso PENDING → En preparación que registra el pago.
 * - "Listo" usa el último READY (si cocina deshizo un Listo, no cuenta).
 * - Cancelado: muestra lo que alcanzó a pasar + el paso Cancelado.
 * - El paso actual es el último alcanzado.
 */
export function construirLineaTiempo(
  eventosSinOrden: readonly EventoEstado[],
  estado: EstadoPedido,
  creadoEn: string,
): PasoLineaTiempo[] {
  const eventos = ordenar(eventosSinOrden);
  const primero = (condicion: (e: EventoEstado) => boolean) =>
    eventos.find(condicion)?.creadoEn ?? null;
  const ultimo = (condicion: (e: EventoEstado) => boolean) =>
    eventos.findLast(condicion)?.creadoEn ?? null;

  const nacioPendiente = eventos.length
    ? eventos[0].hacia === "PENDING"
    : estado === "PENDING";

  const horaEnviado = eventos[0]?.creadoEn ?? creadoEn;
  const horaPagado = primero(
    (e) => e.desde === "PENDING" && (e.hacia === "IN_PROGRESS" || e.hacia === "ACCEPTED"),
  );
  const horaCocina = primero((e) => e.hacia === "IN_PROGRESS");
  // Un READY deshecho (READY → IN_PROGRESS) no cuenta como listo.
  const ultimoListo = eventos.findLastIndex((e) => e.hacia === "READY");
  const ultimoRegreso = eventos.findLastIndex(
    (e) => e.desde === "READY" && e.hacia === "IN_PROGRESS",
  );
  const horaListo = ultimoListo > ultimoRegreso ? eventos[ultimoListo].creadoEn : null;
  const horaEntregado = ultimo((e) => e.hacia === "DELIVERED");

  type Base = { clave: ClavePaso; en: string | null; alcanzado: boolean };
  const avanzado = (estados: EstadoPedido[]) => estados.includes(estado);

  let pasos: Base[] = [
    { clave: "ENVIADO", en: horaEnviado, alcanzado: true },
    ...(nacioPendiente
      ? [{
          clave: "PAGADO" as const,
          en: horaPagado,
          alcanzado: avanzado(["ACCEPTED", "IN_PROGRESS", "READY", "DELIVERED"]) || horaPagado !== null,
        }]
      : []),
    {
      clave: "EN_COCINA",
      en: horaCocina,
      alcanzado: avanzado(["IN_PROGRESS", "READY", "DELIVERED"]) || horaCocina !== null,
    },
    {
      clave: "LISTO",
      en: horaListo,
      alcanzado: avanzado(["READY", "DELIVERED"]) || (estado === "CANCELLED" && horaListo !== null),
    },
    { clave: "ENTREGADO", en: horaEntregado, alcanzado: estado === "DELIVERED" },
  ];

  if (estado === "CANCELLED") {
    pasos = pasos.filter((paso) => paso.alcanzado);
    pasos.push({
      clave: "CANCELADO",
      en: ultimo((e) => e.hacia === "CANCELLED"),
      alcanzado: true,
    });
  }

  const indiceActual = pasos.findLastIndex((paso) => paso.alcanzado);

  return pasos.map((paso, indice) => ({
    clave: paso.clave,
    etiqueta: ETIQUETA_PASO[paso.clave],
    hora: paso.alcanzado && paso.en ? formatearHoraLima(paso.en) : null,
    estado:
      indice === indiceActual ? "actual" : paso.alcanzado ? "hecho" : "pendiente",
  }));
}

/** Avance 0–100 para la barra del ticket. */
export function porcentajeAvance(pasos: readonly PasoLineaTiempo[]): number {
  if (!pasos.length) return 0;
  const actual = pasos.findIndex((paso) => paso.estado === "actual");
  return Math.round(((actual + 1) / pasos.length) * 100);
}

// Si el restaurante aún no tiene pedidos medidos, usamos un valor fijo.
export const MINUTOS_PREPARACION_POR_DEFECTO = 15;
export const PEDIDOS_MINIMOS_PROMEDIO = 3;
// Un promedio menor a 3 min no es real (p. ej. pruebas automáticas que marcan
// "Listo" en segundos): en ese caso también usamos el valor fijo.
export const PROMEDIO_MINIMO_CONFIABLE_MS = 3 * 60_000;

export type TiempoEstimado = {
  minutos: number;
  /** Sin datos propios: se usa el valor fijo y se muestra "aprox.". */
  porDefecto: boolean;
  /** PENDING: la cocina empieza después del pago. */
  despuesDelPago: boolean;
};

/**
 * Minutos que faltan para que el pedido esté listo.
 * Solo aplica mientras espera pago o está en cocina.
 */
export function estimarTiempoRestante(
  estado: EstadoPedido,
  promedioMs: number | null,
  enCocinaDesde: string | null,
  ahora: number,
): TiempoEstimado | null {
  if (estado !== "PENDING" && estado !== "ACCEPTED" && estado !== "IN_PROGRESS") {
    return null;
  }

  const porDefecto =
    promedioMs === null ||
    !Number.isFinite(promedioMs) ||
    promedioMs < PROMEDIO_MINIMO_CONFIABLE_MS;
  const preparacionMs = porDefecto
    ? MINUTOS_PREPARACION_POR_DEFECTO * 60_000
    : promedioMs;

  if (estado !== "IN_PROGRESS") {
    return {
      minutos: Math.max(1, Math.ceil(preparacionMs / 60_000)),
      porDefecto,
      despuesDelPago: estado === "PENDING",
    };
  }

  const inicio = enCocinaDesde ? Date.parse(enCocinaDesde) : Number.NaN;
  const transcurrido = Number.isFinite(inicio) && Number.isFinite(ahora)
    ? Math.max(0, ahora - inicio)
    : 0;

  return {
    // Si ya pasó el promedio, mostramos "1 min" (ya casi), nunca negativo.
    minutos: Math.max(1, Math.ceil((preparacionMs - transcurrido) / 60_000)),
    porDefecto,
    despuesDelPago: false,
  };
}

/** Hora (ISO) de la primera entrada a cocina, para el cálculo del tiempo restante. */
export function inicioEnCocina(eventos: readonly EventoEstado[]): string | null {
  return ordenar(eventos).find((e) => e.hacia === "IN_PROGRESS")?.creadoEn ?? null;
}

/** "YYYY-MM-DD" de Lima, para los rangos del cálculo de tiempos de cocina (US-081). */
export function fechaLima(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}
