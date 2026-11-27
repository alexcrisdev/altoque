import type { ComponentProps } from "react";
import {
  clasesBoton,
  type EsquinaBoton,
  type TamanoBoton,
  type VarianteBoton,
} from "./clases";

export type BotonProps = ComponentProps<"button"> & {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  esquina?: EsquinaBoton;
  cargando?: boolean;
};

export function Boton({
  variante = "primario",
  tamano = "md",
  esquina = "xl",
  className = "",
  cargando = false,
  disabled,
  ...props
}: BotonProps) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando ? true : props["aria-busy"]}
      className={`${clasesBoton(variante, tamano, esquina)} ${cargando ? "cursor-wait" : ""} ${className}`}
    />
  );
}
