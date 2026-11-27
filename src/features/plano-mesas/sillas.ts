// Plano: forma y sillas de una mesa (lógica pura, sin Supabase ni React).
// Las mesas juntas son solo el dibujo: en la base sigue siendo una mesa.

export const FORMAS_MESA = ["ROUND", "SQUARE"] as const;
export type FormaMesa = (typeof FORMAS_MESA)[number];
export const SILLAS_POR_DEFECTO = 4;
export const SILLAS_MAXIMAS = 8;

// Lectura tolerante: si la base aún no tiene la columna shape o la mesa no tiene capacity,
// se dibuja como siempre (redonda, 4 sillas).
export function formaYSillas(fila: { shape?: unknown; capacity?: unknown }): { forma: FormaMesa; sillas: number } {
  const forma = fila.shape === "SQUARE" ? "SQUARE" : "ROUND";
  const sillas = typeof fila.capacity === "number" && Number.isInteger(fila.capacity)
    ? Math.min(SILLAS_MAXIMAS, Math.max(1, fila.capacity)) : SILLAS_POR_DEFECTO;
  return { forma, sillas };
}

export type ValidacionMesa =
  | { ok: true; forma: FormaMesa; sillas: number }
  | { ok: false; mensaje: string };

// Validación del servidor: forma conocida y sillas como entero de 1 a 8 (sin decimales ni texto).
export function validarFormaSillas(forma: unknown, sillas: unknown): ValidacionMesa {
  if (forma !== "ROUND" && forma !== "SQUARE") return { ok: false, mensaje: "Elige una forma válida: cuadrada o redonda." };
  const texto = typeof sillas === "string" ? sillas.trim() : "";
  if (!/^\d{1,2}$/.test(texto) || Number(texto) < 1 || Number(texto) > SILLAS_MAXIMAS) {
    return { ok: false, mensaje: `Las sillas deben ser un número entero de 1 a ${SILLAS_MAXIMAS}.` };
  }
  return { ok: true, forma, sillas: Number(texto) };
}

// Una mesa real lleva hasta 4 sillas; con 5 o 6 se dibujan 2 mesas juntas y con 7 u 8, 3 juntas.
export function mesasJuntas(sillas: number): 1 | 2 | 3 {
  return sillas <= 4 ? 1 : sillas <= 6 ? 2 : 3;
}

export type Lado = "arriba" | "abajo" | "izquierda" | "derecha";
export type Disposicion = {
  // Tamaño de cada tablero (diámetro o lado) y centros relativos al centro de la casilla.
  tablero: number;
  mesas: { x: number; y: number }[];
  silla: number;
  sillas: { x: number; y: number; lado: Lado }[];
};

// Medidas en unidades del plano (casilla de 120 × 130). Con 1 mesa son las de siempre.
const MEDIDAS = { 1: { tablero: 56, silla: 20 }, 2: { tablero: 42, silla: 16 }, 3: { tablero: 29, silla: 14 } } as const;

function fila(cantidad: number, largo: number, y: number, lado: Lado) {
  return Array.from({ length: cantidad }, (_, i) => ({ x: -largo / 2 + largo * (i + 0.5) / cantidad, y, lado }));
}

export function disposicionMesa(sillas: number): Disposicion {
  const juntas = mesasJuntas(sillas);
  const { tablero, silla } = MEDIDAS[juntas];
  const largo = juntas * tablero;
  const mesas = Array.from({ length: juntas }, (_, i) => ({ x: -largo / 2 + tablero * (i + 0.5), y: 0 }));
  const lejos = tablero / 2 + silla / 2, punta = largo / 2 + silla / 2;
  let lados: Lado[];
  let arriba = 0, abajo = 0;
  if (juntas === 1) {
    lados = ([["abajo"], ["arriba", "abajo"], ["arriba", "izquierda", "derecha"], ["arriba", "abajo", "izquierda", "derecha"]] as Lado[][])[sillas - 1];
    arriba = lados.includes("arriba") ? 1 : 0;
    abajo = lados.includes("abajo") ? 1 : 0;
  } else {
    // Una silla en cada punta; el resto se reparte arriba y abajo.
    lados = ["izquierda", "derecha"];
    arriba = Math.ceil((sillas - 2) / 2);
    abajo = Math.floor((sillas - 2) / 2);
  }
  return {
    tablero, mesas, silla,
    sillas: [
      ...fila(arriba, largo, -lejos, "arriba"),
      ...fila(abajo, largo, lejos, "abajo"),
      ...(lados.includes("izquierda") ? [{ x: -punta, y: 0, lado: "izquierda" as const }] : []),
      ...(lados.includes("derecha") ? [{ x: punta, y: 0, lado: "derecha" as const }] : []),
    ],
  };
}
