import { rangoLimaAUtc } from "./ventas-logica";
import { mediana } from "./actividad-logica";

export type EventoCocina = {
  order_id: string;
  to_status: string;
  event: string;
  created_at: string;
  from_status?: string | null;
  reason?: string | null;
};
export type PedidoCocina = {
  id: string;
  status: string;
  order_items: { product_name: string }[];
};
export type IndicadoresTiempo = {
  pedidos: number;
  promedioMs: number;
  maximoMs: number;
};
export type GrupoTiempo = IndicadoresTiempo & { nombre: string };
export type ResumenTiempos = {
  total: IndicadoresTiempo | null;
  porDia: GrupoTiempo[];
  porFranja: GrupoTiempo[];
  porPlato: GrupoTiempo[];
  etapas?: ResumenEtapas;
};

type EstadisticasEtapa = {
  pedidos: number;
  medianaMs: number | null;
  p90Ms: number | null;
};

type ResumenEtapas = {
  pago: EstadisticasEtapa;
  preparacion: EstadisticasEtapa;
  entrega: EstadisticasEtapa;
  porPlato: (EstadisticasEtapa & { nombre: string })[];
};

export const MINIMO_PEDIDOS_PARA_COMPARAR = 10;

const MOTIVOS_PAGO_CONFIRMADO = new Set([
  "US-085: pago confirmado",
  "US-094: pago confirmado",
  "US-097: pago Checkout",
]);

function estadisticasEtapa(tiempos: readonly number[]): EstadisticasEtapa {
  const orden = tiempos.toSorted((a, b) => a - b);
  return {
    pedidos: orden.length,
    medianaMs: orden.length ? mediana(orden) : null,
    p90Ms: orden[Math.ceil(0.9 * orden.length) - 1] ?? null,
  };
}

function agregarTiempo(mapa: Map<string, number[]>, clave: string, tiempo: number) {
  const valores = mapa.get(clave) ?? [];
  valores.push(tiempo);
  mapa.set(clave, valores);
}

function agruparEventos(historial: readonly EventoCocina[]) {
  const eventos = new Map<string, EventoCocina[]>();
  for (const evento of historial) {
    if (evento.event !== "STATUS") continue;
    const lista = eventos.get(evento.order_id) ?? [];
    lista.push(evento);
    eventos.set(evento.order_id, lista);
  }
  return eventos;
}

export function calcularTiemposPorEtapa(
  pedidos: readonly PedidoCocina[],
  historial: readonly EventoCocina[],
  desde: string,
  hasta: string,
): ResumenEtapas {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(desde, hasta);
  const minimo = Date.parse(desdeUtc);
  const limite = Date.parse(hastaUtcExclusivo);
  const eventos = agruparEventos(historial);
  const pago: number[] = [];
  const preparacion: number[] = [];
  const entrega: number[] = [];
  const platos = new Map<string, number[]>();

  const duracion = (inicio: number | undefined, fin: number | undefined) => {
    if (inicio === undefined || fin === undefined || inicio < minimo || inicio >= limite || fin < inicio) {
      return undefined;
    }
    return fin - inicio;
  };

  for (const pedido of pedidos) {
    if (pedido.status === "CANCELLED") continue;
    const marcas = (eventos.get(pedido.id) ?? [])
      .map((evento) => ({ ...evento, ms: Date.parse(evento.created_at) }))
      .filter(({ ms }) => Number.isFinite(ms))
      .sort((a, b) => a.ms - b.ms);
    const pendiente = marcas.find((evento) => evento.to_status === "PENDING")?.ms;
    const enCocina = marcas.filter((evento) => evento.to_status === "IN_PROGRESS");
    const primeroEnCocina = enCocina[0];
    const ultimoEnCocina = enCocina.at(-1)?.ms;
    const listo = marcas.findLast((evento) => evento.to_status === "READY")?.ms;
    const entregado = marcas.findLast((evento) => evento.to_status === "DELIVERED")?.ms;

    if (primeroEnCocina?.from_status === "PENDING" && MOTIVOS_PAGO_CONFIRMADO.has(primeroEnCocina.reason ?? "")) {
      const espera = duracion(pendiente, primeroEnCocina.ms);
      if (espera !== undefined) pago.push(espera);
    }

    const listoDefinitivo = listo !== undefined && (ultimoEnCocina === undefined || listo >= ultimoEnCocina);
    if (!listoDefinitivo) continue;
    if (pedido.status === "READY" || pedido.status === "DELIVERED") {
      const tiempo = duracion(primeroEnCocina?.ms, listo);
      if (tiempo !== undefined) {
        preparacion.push(tiempo);
        for (const nombre of new Set(pedido.order_items.map((item) => item.product_name))) {
          agregarTiempo(platos, nombre, tiempo);
        }
      }
    }
    if (pedido.status === "DELIVERED") {
      const tiempo = duracion(listo, entregado);
      if (tiempo !== undefined) entrega.push(tiempo);
    }
  }

  return {
    pago: estadisticasEtapa(pago),
    preparacion: estadisticasEtapa(preparacion),
    entrega: estadisticasEtapa(entrega),
    porPlato: [...platos].map(([nombre, tiempos]) => ({ nombre, ...estadisticasEtapa(tiempos) }))
      .sort((a, b) => (b.medianaMs ?? 0) - (a.medianaMs ?? 0)
        || (b.p90Ms ?? 0) - (a.p90Ms ?? 0)
        || a.nombre.localeCompare(b.nombre, "es")),
  };
}

function indicadores(tiempos: number[]): IndicadoresTiempo {
  return {
    pedidos: tiempos.length,
    promedioMs: tiempos.reduce((suma, valor) => suma + valor, 0) / tiempos.length,
    maximoMs: tiempos.reduce((maximo, valor) => Math.max(maximo, valor), 0),
  };
}

function grupos(mapa: Map<string, number[]>): GrupoTiempo[] {
  return [...mapa].sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([nombre, tiempos]) => ({ nombre, ...indicadores(tiempos) }));
}

export function calcularTiemposCocina(
  pedidos: readonly PedidoCocina[],
  historial: readonly EventoCocina[],
  desde: string,
  hasta: string,
  corteUtc?: string,
): ResumenTiempos {
  const limites = rangoLimaAUtc(desde, hasta);
  const minimo = Date.parse(limites.desdeUtc);
  const corte = corteUtc === undefined ? Infinity : Date.parse(corteUtc);
  if (Number.isNaN(corte) || corte < minimo) throw new Error("Corte de cocina inválido.");
  const limite = Math.min(Date.parse(limites.hastaUtcExclusivo), corte);
  const eventos = agruparEventos(historial);
  const total: number[] = [];
  const dias = new Map<string, number[]>();
  const franjas = new Map<string, number[]>();
  const platos = new Map<string, number[]>();
  const vistos = new Set<string>();
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  for (const pedido of pedidos) {
    if (vistos.has(pedido.id)) throw new Error("Pedido duplicado.");
    vistos.add(pedido.id);
    // US-081: primer IN_PROGRESS hasta el último READY definitivo, nunca
    // fechas inventadas. CANCELLED y un READY deshecho aún en preparación no cuentan.
    if (pedido.status === "CANCELLED") continue;
    const estados = (eventos.get(pedido.id) ?? [])
      .filter((evento) => corteUtc === undefined || Date.parse(evento.created_at) < corte);
    // Para comparar una hora pasada usamos el estado conocido entonces.
    // Los cancelados actuales quedan fuera incluso si estuvieron listos antes.
    const estado = corteUtc === undefined ? pedido.status : [...estados]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).at(-1)?.to_status;
    if (estado !== "READY" && estado !== "DELIVERED") continue;
    if (estados.some((e) => !Number.isFinite(Date.parse(e.created_at)))) continue;
    const inicios = estados.filter((e) => e.to_status === "IN_PROGRESS")
      .map((e) => Date.parse(e.created_at));
    const finales = estados.filter((e) => e.to_status === "READY")
      .map((e) => Date.parse(e.created_at));
    if (!inicios.length || !finales.length) continue;
    const inicio = inicios.reduce((a, b) => Math.min(a, b));
    const final = finales.reduce((a, b) => Math.max(a, b));
    const ultimaPreparacion = inicios.reduce((a, b) => Math.max(a, b));
    if (final < ultimaPreparacion || inicio < minimo || inicio >= limite) continue;
    const duracion = final - inicio;
    const partes = formato.formatToParts(new Date(inicio));
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
    total.push(duracion);
    agregarTiempo(dias, `${parte("year")}-${parte("month")}-${parte("day")}`, duracion);
    agregarTiempo(franjas, `${parte("hour")}:00–${parte("hour")}:59`, duracion);
    for (const nombre of new Set(pedido.order_items.map((item) => item.product_name))) {
      agregarTiempo(platos, nombre, duracion);
    }
  }
  return {
    total: total.length ? indicadores(total) : null,
    porDia: grupos(dias), porFranja: grupos(franjas), porPlato: grupos(platos),
  };
}
