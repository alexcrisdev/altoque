import { rangoLimaAUtc } from "./ventas-logica";

export type EventoCocina = {
  order_id: string;
  to_status: string;
  event: string;
  created_at: string;
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
};

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
): ResumenTiempos {
  const limites = rangoLimaAUtc(desde, hasta);
  const minimo = Date.parse(limites.desdeUtc);
  const limite = Date.parse(limites.hastaUtcExclusivo);
  const eventos = new Map<string, EventoCocina[]>();
  for (const evento of historial) {
    if (evento.event !== "STATUS") continue;
    const lista = eventos.get(evento.order_id) ?? [];
    lista.push(evento);
    eventos.set(evento.order_id, lista);
  }
  const total: number[] = [];
  const dias = new Map<string, number[]>();
  const franjas = new Map<string, number[]>();
  const platos = new Map<string, number[]>();
  const vistos = new Set<string>();
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const agregar = (mapa: Map<string, number[]>, clave: string, tiempo: number) => {
    const valores = mapa.get(clave) ?? [];
    valores.push(tiempo);
    mapa.set(clave, valores);
  };
  for (const pedido of pedidos) {
    if (vistos.has(pedido.id)) throw new Error("Pedido duplicado.");
    vistos.add(pedido.id);
    // US-081: primer IN_PROGRESS hasta el último READY definitivo, nunca
    // fechas inventadas. CANCELLED y un READY deshecho aún en preparación no cuentan.
    if (pedido.status !== "READY" && pedido.status !== "DELIVERED") continue;
    const estados = eventos.get(pedido.id) ?? [];
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
    agregar(dias, `${parte("year")}-${parte("month")}-${parte("day")}`, duracion);
    agregar(franjas, `${parte("hour")}:00–${parte("hour")}:59`, duracion);
    for (const nombre of new Set(pedido.order_items.map((item) => item.product_name))) {
      agregar(platos, nombre, duracion);
    }
  }
  return {
    total: total.length ? indicadores(total) : null,
    porDia: grupos(dias), porFranja: grupos(franjas), porPlato: grupos(platos),
  };
}
