import { fechaActualLima } from "../carta/validar-stock";
import { MODELO_SUGERENCIA_STOCK } from "./sugerencia-stock-logica";

export type PrediccionPlato = {
  productoId: string;
  nombre: string;
  fecha: string;
  cantidadPrevista: number;
  modelo: string;
  creadoEn: string;
};

export type ComparacionStock = {
  stockRegistrado: number | null;
  cantidadPrevista: number;
  faltantes: number;
  alerta: boolean;
};

const MAXIMO_ENTERO = 2147483647;

function validarFecha(fecha: string): void {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith("0000-")) {
    throw new Error("La fecha de predicción no es válida.");
  }
  const instante = Date.parse(`${fecha}T00:00:00.000Z`);
  if (!Number.isFinite(instante) || new Date(instante).toISOString().slice(0, 10) !== fecha) {
    throw new Error("La fecha de predicción no es válida.");
  }
}

export function redondearCantidadPrevista(cantidad: number): number {
  if (typeof cantidad !== "number" || !Number.isFinite(cantidad) || cantidad < 0 || cantidad > MAXIMO_ENTERO) {
    throw new Error("La cantidad prevista no es válida.");
  }
  // Mismo criterio que el cargador CSV: entero más cercano, .5 hacia arriba.
  return Math.round(cantidad);
}

export function fechaMananaLima(ahora: Date = new Date()): string {
  if (!Number.isFinite(ahora.getTime())) throw new Error("La fecha actual no es válida.");
  const hoy = fechaActualLima(ahora);
  validarFecha(hoy);
  const manana = new Date(`${hoy}T00:00:00.000Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const fecha = manana.toISOString().slice(0, 10);
  validarFecha(fecha);
  return fecha;
}

export function nombreDiaPrediccion(fecha: string): string {
  validarFecha(fecha);
  // Mediodía UTC sigue siendo la misma fecha en Lima.
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", weekday: "long",
  }).format(new Date(`${fecha}T12:00:00.000Z`));
}

export function compararStockConPrediccion(
  stock: number | null | undefined,
  previsto: number,
): ComparacionStock {
  const cantidadPrevista = redondearCantidadPrevista(previsto);
  if (stock === null || stock === undefined) {
    return { stockRegistrado: null, cantidadPrevista, faltantes: 0, alerta: false };
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > MAXIMO_ENTERO) {
    throw new Error("El stock registrado no es válido.");
  }
  const faltantes = Math.max(0, cantidadPrevista - stock);
  return { stockRegistrado: stock, cantidadPrevista, faltantes, alerta: faltantes > 0 };
}

// Reutilizable por US-089. Devuelve hasta N platos de una fecha, de un único modelo.
// Prioriza modelos reales frente a los desplazados para demo. Entre versiones del
// mismo tipo elige la de creación más reciente; desempata por el nombre del modelo.
export function topPlatosPrevistos(
  predicciones: readonly PrediccionPlato[],
  fecha: string,
  limite = 3,
): PrediccionPlato[] {
  validarFecha(fecha);
  if (!Number.isSafeInteger(limite) || limite < 1) throw new Error("El límite de platos no es válido.");
  const seleccion = filasValidasDeFecha(predicciones, fecha);
  const versiones = new Map<string, number>();
  for (const fila of seleccion) {
    versiones.set(fila.modelo, Math.max(versiones.get(fila.modelo) ?? -Infinity, Date.parse(fila.creadoEn)));
  }

  const modelo = [...versiones.keys()].sort((a, b) =>
    Number(a.endsWith("-demo")) - Number(b.endsWith("-demo")) ||
    versiones.get(b)! - versiones.get(a)! ||
    a.localeCompare(b, "es"),
  )[0];

  return ordenarPorCantidad(seleccion.filter(fila => fila.modelo === modelo)).slice(0, limite);
}

// US-146: misma selección para "Rellenar con la predicción" y la tarjeta de mañana.
// Elige una predicción por plato: primero la sugerencia propia (ventas reales), luego
// otro modelo real y al final la demo, para que un plato sin datos conserve su demo.
// Entre versiones del mismo tipo gana la más reciente; desempata por nombre del modelo.
export function seleccionarPrediccionPorPlato(
  predicciones: readonly PrediccionPlato[],
  fecha: string,
): PrediccionPlato[] {
  validarFecha(fecha);
  const prioridad = (fila: PrediccionPlato) =>
    fila.modelo === MODELO_SUGERENCIA_STOCK ? 0 : esModeloDemo(fila.modelo) ? 2 : 1;
  // Negativo si `a` debe ganar a `b`.
  const comparar = (a: PrediccionPlato, b: PrediccionPlato) =>
    prioridad(a) - prioridad(b) ||
    Date.parse(b.creadoEn) - Date.parse(a.creadoEn) ||
    a.modelo.localeCompare(b.modelo, "es");
  const porPlato = new Map<string, PrediccionPlato>();
  for (const fila of filasValidasDeFecha(predicciones, fecha)) {
    const actual = porPlato.get(fila.productoId);
    if (!actual || comparar(fila, actual) < 0) porPlato.set(fila.productoId, fila);
  }
  return ordenarPorCantidad([...porPlato.values()]);
}

export function esModeloDemo(modelo: string): boolean {
  return modelo.endsWith("-demo");
}

function filasValidasDeFecha(predicciones: readonly PrediccionPlato[], fecha: string): PrediccionPlato[] {
  const claves = new Set<string>();
  const seleccion: PrediccionPlato[] = [];
  for (const fila of predicciones) {
    validarFecha(fila.fecha);
    if (fila.fecha !== fecha) continue;
    const creado = Date.parse(fila.creadoEn);
    if (typeof fila.productoId !== "string" || !fila.productoId.trim() ||
        typeof fila.nombre !== "string" || !fila.nombre.trim() ||
        typeof fila.modelo !== "string" || !fila.modelo.trim() || fila.modelo !== fila.modelo.trim() ||
        !Number.isFinite(creado) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(fila.creadoEn)) {
      throw new Error("Los datos de la predicción no son válidos.");
    }
    validarFecha(fila.creadoEn.slice(0, 10));
    const clave = JSON.stringify([fila.productoId, fila.modelo]);
    if (claves.has(clave)) throw new Error("Hay predicciones duplicadas para un producto y modelo.");
    claves.add(clave);
    seleccion.push({ ...fila, cantidadPrevista: redondearCantidadPrevista(fila.cantidadPrevista) });
  }
  return seleccion;
}

function ordenarPorCantidad(filas: PrediccionPlato[]): PrediccionPlato[] {
  return filas.sort((a, b) => b.cantidadPrevista - a.cantidadPrevista ||
    a.nombre.localeCompare(b.nombre, "es") || a.productoId.localeCompare(b.productoId));
}
