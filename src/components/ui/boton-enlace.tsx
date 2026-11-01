import Link from "next/link";
import type { ComponentProps } from "react";
import {
  clasesBoton,
  type TamanoBoton,
  type VarianteBoton,
} from "./clases";

export type BotonEnlaceProps = ComponentProps<typeof Link> & {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
};

export function BotonEnlace({
  variante = "primario",
  tamano = "md",
  className = "",
  ...props
}: BotonEnlaceProps) {
  return (
    <Link
      {...props}
      className={`${clasesBoton(variante, tamano)} ${className}`}
    />
  );
}