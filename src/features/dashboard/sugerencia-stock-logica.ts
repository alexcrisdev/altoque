// US-146: cálculo de la sugerencia diaria de stock (reglas puras, sin base de datos).
// Sin imports a propósito: scripts/analitica/evaluar-sugerencia-stock.mjs lo carga con
// Node directamente para medir el error con los datos sintéticos de US-075.

export const MODELO_SUGERENCIA_STOCK = "promedio-ponderado-v1";
export const DIAS_HISTORIA = 28; // 4 semanas terminadas
export const MINIMO_DIAS = 3; // con menos días no hay sugerencia propia
export const DIAS_AGOTADOS = 7; // ventana del bloque "Agotados" en la pantalla de stock
const MAXIMO_DIAS_RECIENTES = 7;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

export type MotivoIncompleto = "AGOTADO" | "BLOQUEADO" | "LOCAL_CERRADO";

// Una fila de daily_product_sales de un plato.
export type DiaVenta = {
  fecha: string;
  unidades: number;
  motivo: MotivoIncompleto | null;
};

export type SugerenciaCalculada = {
  cantidad: number;
  metodo: "mismo_dia" | "dias_recientes";
  dias: number;
};

type Observacion = { unidades: number; agotado: boolean; peso: number };

function validarFecha(fecha: string): number {
  const instante = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? Date.parse(`${fecha}T12:00:00Z`) : NaN;
  if (!Number.isFinite(instante) || new Date(instante).toISOString().slice(0, 10) !== fecha) {
    throw new Error("La fecha de la sugerencia no es válida.");
  }
  return instante;
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(validarFecha(fecha) + dias * UN_DIA_MS).toISOString().slice(0, 10);
}

function diferenciaDias(desde: string, hasta: string): number {
  return Math.round((validarFecha(hasta) - validarFecha(desde)) / UN_DIA_MS);
}

function promedioPonderado(observaciones: readonly Observacion[]): number {
  const pesos = observaciones.reduce((total, fila) => total + fila.peso, 0);
  return observaciones.reduce((total, fila) => total + fila.unidades * fila.peso, 0) / pesos;
}

// Un día agotado vendió menos de lo que se pidió: entra con lo vendido o con el promedio
// de los días completos, el que sea mayor. Así nunca baja la sugerencia.
function promedioConAgotados(observaciones: readonly Observacion[]): number {
  const completos = observaciones.filter(fila => !fila.agotado);
  const base = completos.length ? promedioPonderado(completos) : 0;
  return promedioPonderado(observaciones.map(fila =>
    fila.agotado ? { ...fila, unidades: Math.max(fila.unidades, base) } : fila,
  ));
}

/**
 * Sugerencia de un plato para `fechaObjetivo`, usando solo días terminados antes de `hoy`
 * (las últimas 4 semanas). Devuelve null si hay menos de 3 días válidos: el plato conserva
 * la predicción demo si existe. Nunca devuelve 0, porque 0 pondría candado al plato.
 */
export function calcularSugerenciaPlato(
  historia: readonly DiaVenta[],
  fechaObjetivo: string,
  hoy: string,
): SugerenciaCalculada | null {
  if (diferenciaDias(hoy, fechaObjetivo) < 0) throw new Error("La fecha de la sugerencia ya pasó.");
  const fechas = new Set<string>();
  const validos: DiaVenta[] = [];
  for (const dia of historia) {
    const atras = diferenciaDias(dia.fecha, hoy);
    if (!Number.isSafeInteger(dia.unidades) || dia.unidades < 0 || fechas.has(dia.fecha)) {
      throw new Error("La historia de ventas no es válida.");
    }
    fechas.add(dia.fecha);
    // Solo días terminados de las últimas 4 semanas. Bloqueado o local cerrado no es demanda real.
    if (atras < 1 || atras > DIAS_HISTORIA) continue;
    if (dia.motivo === "BLOQUEADO" || dia.motivo === "LOCAL_CERRADO") continue;
    validos.push(dia);
  }

  // 1) Mismo día de la semana: pesos 4, 3, 2 y 1, de la semana más reciente a la más antigua.
  const mismoDia: Observacion[] = [];
  for (const dia of validos) {
    const distancia = diferenciaDias(dia.fecha, fechaObjetivo);
    if (distancia % 7 !== 0) continue;
    const semanas = distancia / 7;
    if (semanas < 1 || semanas > 4) continue;
    mismoDia.push({ unidades: dia.unidades, agotado: dia.motivo === "AGOTADO", peso: 5 - semanas });
  }
  if (mismoDia.length >= MINIMO_DIAS) {
    return { cantidad: redondear(promedioConAgotados(mismoDia)), metodo: "mismo_dia", dias: mismoDia.length };
  }

  // 2) Si no alcanza: los últimos días válidos (hasta 7), con más peso en los recientes.
  const recientes = [...validos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, MAXIMO_DIAS_RECIENTES)
    .map((dia, posicion): Observacion => ({
      unidades: dia.unidades, agotado: dia.motivo === "AGOTADO", peso: MAXIMO_DIAS_RECIENTES - posicion,
    }));
  if (recientes.length < MINIMO_DIAS) return null;
  return { cantidad: redondear(promedioConAgotados(recientes)), metodo: "dias_recientes", dias: recientes.length };
}

// Entero más cercano (.5 hacia arriba, como el cargador CSV) y nunca menos de 1.
function redondear(cantidad: number): number {
  return Math.max(1, Math.round(cantidad));
}

/**
 * Hora aproximada del quiebre: el momento en que lo reservado del día alcanzó el stock
 * inicial. Si nunca lo alcanza (una cancelación devolvió unidades y luego se volvieron a
 * vender), se usa el último pedido. Es aproximada: se basa en la hora de cada pedido.
 */
export function momentoQuiebre(
  lineas: readonly { creadoEn: string; cantidad: number }[],
  stockInicial: number,
): string | null {
  const ordenadas = lineas
    .map(linea => ({ ...linea, instante: Date.parse(linea.creadoEn) }))
    .filter(linea => Number.isFinite(linea.instante) && Number.isSafeInteger(linea.cantidad) && linea.cantidad > 0)
    .sort((a, b) => a.instante - b.instante);
  let acumulado = 0;
  for (const linea of ordenadas) {
    acumulado += linea.cantidad;
    if (acumulado >= stockInicial) return linea.creadoEn;
  }
  return ordenadas.at(-1)?.creadoEn ?? null;
}
