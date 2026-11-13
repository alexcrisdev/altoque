import { rangoLimaAUtc } from "./ventas-logica";

export const DIAS_MAPA = [
  "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
] as const;

export type PedidoMapa = {
  id: string;
  creadoEn: string;
  cancelado: boolean;
  productos: readonly string[];
};

export type FiltroMapa = {
  desde: string;
  hasta: string;
  horaDesde: number;
  horaHasta: number;
  diasAbiertos: readonly number[]; // Lunes = 0; domingo = 6.
  productoId?: string;
};

export type FranjaMapa = {
  dia: number;
  hora: number;
  diasEnRango: number;
  pedidos: number;
  promedio: number;
  bajaDemanda: boolean;
};

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

export function calcularMapaCalor(
  pedidos: readonly PedidoMapa[],
  filtro: FiltroMapa,
) {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(filtro.desde, filtro.hasta);

  if (
    !Number.isInteger(filtro.horaDesde) ||
    !Number.isInteger(filtro.horaHasta) ||
    filtro.horaDesde < 0 || filtro.horaHasta > 24 ||
    filtro.horaDesde >= filtro.horaHasta ||
    filtro.diasAbiertos.length === 0 ||
    filtro.diasAbiertos.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6) ||
    (filtro.productoId !== undefined && !filtro.productoId.trim())
  ) {
    throw new Error("El horario o el producto no es válido.");
  }

  const inicio = Date.parse(desdeUtc);
  const fin = Date.parse(hastaUtcExclusivo);
  const dias = Math.round((fin - inicio) / DIA_MS);
  const primerDia = (new Date(`${filtro.desde}T00:00:00Z`).getUTCDay() + 6) % 7;
  const abiertas = new Set(filtro.diasAbiertos);
  const celdas: FranjaMapa[] = [];
  const porClave = new Map<string, FranjaMapa>();

  for (let dia = 0; dia < 7; dia++) {
    const distancia = (dia - primerDia + 7) % 7;
    const repeticiones = distancia < dias
      ? Math.floor((dias - distancia - 1) / 7) + 1
      : 0;

    for (let hora = filtro.horaDesde; hora < filtro.horaHasta; hora++) {
      const celda: FranjaMapa = {
        dia,
        hora,
        diasEnRango: abiertas.has(dia) ? repeticiones : 0,
        pedidos: 0,
        promedio: 0,
        bajaDemanda: false,
      };

      celdas.push(celda);
      porClave.set(`${dia}:${hora}`, celda);
    }
  }

  const vistos = new Set<string>();

  for (const pedido of pedidos) {
    const instante = Date.parse(pedido.creadoEn);

    // La fuente debe declarar su zona: los CSV locales se normalizarán a -05:00.
    if (
      !pedido.id.trim() || !Number.isFinite(instante) ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(pedido.creadoEn) ||
      typeof pedido.cancelado !== "boolean" ||
      !Array.isArray(pedido.productos) ||
      pedido.productos.some((id) => typeof id !== "string" || !id.trim())
    ) {
      throw new Error("El pedido contiene datos inválidos.");
    }

    if (vistos.has(pedido.id)) continue;
    vistos.add(pedido.id);

    if (pedido.cancelado || instante < inicio || instante >= fin) continue;
    if (filtro.productoId && !pedido.productos.includes(filtro.productoId)) continue;

    // Lima UTC-5: no dependemos de la zona horaria del equipo.
    const local = new Date(instante - 5 * HORA_MS);
    const dia = (local.getUTCDay() + 6) % 7;
    const celda = porClave.get(`${dia}:${local.getUTCHours()}`);

    if (celda && celda.diasEnRango > 0) celda.pedidos++;
  }

  for (const celda of celdas) {
    celda.promedio = celda.diasEnRango === 0
      ? 0
      : celda.pedidos / celda.diasEnRango;
  }

  // US-084: al menos dos fechas por día de semana y promedio
  // menor o igual a la mitad de la media de las franjas comparables.
  const comparables = celdas.filter((celda) => celda.diasEnRango >= 2);
  const media = comparables.length === 0
    ? 0
    : comparables.reduce((suma, celda) => suma + celda.promedio, 0) / comparables.length;

  for (const celda of comparables) {
    celda.bajaDemanda = media > 0 && celda.promedio <= media / 2;
  }

  const sugerencias = celdas
    .filter((celda) => celda.bajaDemanda)
    .map((celda) => ({
      dia: celda.dia,
      hora: celda.hora,
      texto: `Promoción sugerida: ${DIAS_MAPA[celda.dia]} de ${String(celda.hora).padStart(2, "0")}:00 a ${String(celda.hora + 1).padStart(2, "0")}:00`,
    }));

  return {
    celdas,
    sugerencias,
    totalPedidos: celdas.reduce((suma, celda) => suma + celda.pedidos, 0),
  };
}