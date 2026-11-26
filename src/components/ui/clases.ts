export type VarianteBoton =
  | "primario"
  | "secundario"
  | "peligro"
  | "fantasma"
  | "exito"
  | "contorno"
  | "peligro-contorno"
  | "transparente"
  | "enlace";

// md y lg fijan relleno y tipografía. «icono» es un cuadrado de 44 × 44 px.
// «propio» solo garantiza los 44 px: el relleno y la tipografía los pone quien
// lo usa, para conservar el diseño de botones existentes. «xl» mide 56 px de alto.
export type TamanoBoton = "md" | "lg" | "icono" | "propio" | "xl";

export type EsquinaBoton = "xl" | "lg" | "sm" | "ninguna";

export type TonoTarjeta =
  | "neutro"
  | "suave"
  | "exito"
  | "aviso"
  | "info"
  | "peligro";

export type RellenoTarjeta =
  | "compacto"
  | "normal"
  | "amplio"
  | "destacado";

export type TonoInsignia =
  | "neutro"
  | "info"
  | "aviso"
  | "progreso"
  | "exito"
  | "peligro";

const variantes: Record<VarianteBoton, string> = {
  primario:
    "border-transparent bg-marca text-texto-inverso hover:bg-marca-hover",
  secundario:
    "border-borde bg-superficie text-texto hover:border-marca hover:bg-superficie-suave",
  peligro:
    "border-transparent bg-peligro text-texto-inverso hover:bg-peligro-hover",
  fantasma:
    "border-transparent bg-transparent text-marca hover:bg-superficie-suave",
  exito:
    "border-exito-borde bg-exito-fondo text-exito-texto hover:bg-exito-fondo",
  // Las variantes siguientes no fijan el color del texto: lo heredan o lo pone
  // quien las usa, como hacían los botones nativos que reemplazan.
  contorno:
    "border-borde bg-transparent hover:bg-superficie-suave",
  "peligro-contorno":
    "border-peligro-borde bg-transparent text-peligro-texto hover:bg-peligro-fondo",
  transparente:
    "border-transparent bg-transparent hover:bg-superficie-suave",
  enlace:
    "border-transparent bg-transparent underline",
};

const tamanos: Record<TamanoBoton, string> = {
  md: "min-h-11 px-4 py-2 text-sm font-semibold",
  lg: "min-h-11 min-h-12 px-5 py-3 text-base font-semibold",
  icono: "min-h-11 size-11 shrink-0 p-0",
  propio: "min-h-11",
  xl: "min-h-14 px-5 py-3 text-lg font-semibold",
};

const esquinas: Record<EsquinaBoton, string> = {
  xl: "rounded-xl",
  lg: "rounded-lg",
  sm: "rounded",
  ninguna: "",
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

const tonosTarjeta: Record<TonoTarjeta, string> = {
  neutro: "bg-superficie border-borde",
  suave: "bg-superficie-suave border-borde",
  exito: "bg-exito-fondo border-exito-borde",
  aviso: "bg-aviso-fondo border-aviso-borde",
  info: "bg-info-fondo border-info-borde",
  peligro: "bg-peligro-fondo border-peligro-borde",
};

const rellenosTarjeta: Record<RellenoTarjeta, string> = {
  compacto: "p-4",
  normal: "p-5",
  amplio: "p-6",
  destacado: "p-6 sm:p-9",
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

// La altura, el grosor de letra y el radio van en el tamaño y la esquina, no en
// la base: así un botón puede conservar los suyos sin dos clases en conflicto.
export function clasesBoton(
  variante: unknown = "primario",
  tamano: unknown = "md",
  esquina: unknown = "xl",
): string {
  return [
    "ui-boton inline-flex min-w-11 items-center justify-center gap-2",
    "border text-center transition-colors motion-safe:active:translate-y-px",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-marca",
    "disabled:pointer-events-none disabled:opacity-50",
    obtenerClase(variantes, variante, "primario"),
    obtenerClase(tamanos, tamano, "md"),
    obtenerClase(esquinas, esquina, "xl"),
  ].filter(Boolean).join(" ");
}

export function clasesInsignia(
  tono: unknown = "neutro",
): string {
  return [
    "inline-flex items-center rounded-full border px-3 py-1",
    "text-xs font-semibold leading-5",
    obtenerClase(tonos, tono, "neutro"),
  ].join(" ");
}

export function clasesTarjeta(
  tono: unknown = "neutro",
  relleno: unknown = "normal",
): string {
  return [
    "tarjeta rounded-2xl border text-texto",
    obtenerClase(tonosTarjeta, tono, "neutro"),
    obtenerClase(rellenosTarjeta, relleno, "normal"),
  ].join(" ");
}
