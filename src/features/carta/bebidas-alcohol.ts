// US-156: bebidas con alcohol (lógica pura, sin base). La reutiliza US-160 (consumo responsable).
//
// Tragos estándar: 1 trago estándar = 10 g de alcohol puro (referencia OMS).
//   gramos de alcohol = ml × (% / 100) × 0.789   (0.789 g/ml es la densidad del alcohol)
//   tragos estándar   = gramos / 10  =  ml × % × 0.789 / 1000
// Ejemplo: una Cusqueña de 620 ml al 5 % ≈ 2.4 tragos estándar.

export const CATEGORIA_CON_ALCOHOL = "Bebidas con alcohol";

/** Mismos límites que la base (migración US-156). */
export const ALCOHOL_MINIMO = 0;
export const ALCOHOL_MAXIMO = 100;
export const ML_MINIMO = 1;
export const ML_MAXIMO = 5000;

const DENSIDAD_ALCOHOL = 0.789; // g/ml
const GRAMOS_POR_TRAGO = 10;

/** Tragos estándar exactos (sin redondear). null si los datos no son válidos. */
export function tragosEstandar(ml: number, porcentajeAlcohol: number): number | null {
  if (!Number.isFinite(ml) || !Number.isFinite(porcentajeAlcohol)) return null;
  if (ml < ML_MINIMO || ml > ML_MAXIMO || porcentajeAlcohol < ALCOHOL_MINIMO || porcentajeAlcohol > ALCOHOL_MAXIMO) return null;
  return (ml * (porcentajeAlcohol / 100) * DENSIDAD_ALCOHOL) / GRAMOS_POR_TRAGO;
}

/** Tragos estándar con 1 decimal, para mostrar. */
export function tragosEstandarRedondeado(ml: number, porcentajeAlcohol: number): number | null {
  const tragos = tragosEstandar(ml, porcentajeAlcohol);
  return tragos === null ? null : Math.round(tragos * 10) / 10;
}

/** Texto para la pantalla: "≈ 2.4 tragos estándar" (o "≈ 1 trago estándar"). null si faltan datos. */
export function textoTragosEstandar(ml: number, porcentajeAlcohol: number): string | null {
  const tragos = tragosEstandarRedondeado(ml, porcentajeAlcohol);
  if (tragos === null) return null;
  return `≈ ${tragos.toFixed(1)} ${tragos === 1 ? "trago estándar" : "tragos estándar"}`;
}

/** % de alcohol válido: 0 a 100 con hasta 1 decimal. */
export function porcentajeAlcoholValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= ALCOHOL_MINIMO && valor <= ALCOHOL_MAXIMO
    && Math.abs(Math.round(valor * 10) - valor * 10) < 1e-9; // 1.1 × 10 da 11.000000000000002
}

/** ml válidos: entero de 1 a 5000. */
export function mlValidos(valor: number): boolean {
  return Number.isInteger(valor) && valor >= ML_MINIMO && valor <= ML_MAXIMO;
}
