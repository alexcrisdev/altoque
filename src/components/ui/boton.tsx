import type { ComponentProps } from "react";
import {
  clasesBoton,
  type TamanoBoton,
  type VarianteBoton,
} from "./clases";

export type BotonProps = ComponentProps<"button"> & {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
};

export function Boton({
  variante = "primario",
  tamano = "md",
  className = "",
  ...props
}: BotonProps) {
  return (
    <button
      {...props}
      className={`${clasesBoton(variante, tamano)} ${className}`}
    />
  );
}