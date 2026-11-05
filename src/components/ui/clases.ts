export type VarianteBoton =
  | "primario"
  | "secundario"
  | "peligro"
  | "fantasma";

export type TamanoBoton = "md" | "lg";

export type TonoInsignia =
  | "neutro"
  | "info"
  | "aviso"
  | "progreso"
  | "exito"
  | "peligro";

const variantes: Record<VarianteBoton, string> = {
  primario:
    "border-transparent bg-marca text-white hover:bg-marca-hover",
  secundario:
    "border-borde bg-superficie text-texto hover:bg-superficie-suave",
  peligro:
    "border-transparent bg-peligro text-white hover:bg-peligro-hover",
  fantasma:
    "border-transparent bg-transparent text-marca hover:bg-superficie-suave",
};

const tamanos: Record<TamanoBoton, string> = {
  md: "px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
};

const tonos: Record<TonoInsignia, string> = {
  neutro:
    "border-neutro-borde bg-neutro-fondo text-neutro-texto",
  info:
    "border-info-borde bg-info-fondo text-info-texto",
  aviso:
    "border-aviso-borde bg-aviso-fondo text-aviso-texto",
  progreso:
    "border-progreso-borde bg-progreso-fondo text-progreso-texto",
  exito:
    "border-exito-borde bg-exito-fondo text-exito-texto",
  peligro:
    "border-peligro-borde bg-peligro-fondo text-peligro-texto",
};

function obtenerClase(
  opciones: Record<string, string>,
  valor: unknown,
  alternativa: string,
): string {
  return typeof valor === "string" && Object.hasOwn(opciones, valor)
    ? opciones[valor]
    : opciones[alternativa];
}

export function clasesBoton(
  variante: unknown = "primario",
  tamano: unknown = "md",
): string {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2",
    "rounded-xl border font-semibold text-center transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-marca",
    "disabled:pointer-events-none disabled:opacity-50",
    obtenerClase(variantes, variante, "primario"),
    obtenerClase(tamanos, tamano, "md"),
  ].join(" ");
}

export function clasesInsignia(
  tono: unknown = "neutro",
): string {
  return [
    "inline-flex items-center rounded-full border px-3 py-1",
    "text-xs font-semibold",
    obtenerClase(tonos, tono, "neutro"),
  ].join(" ");
}