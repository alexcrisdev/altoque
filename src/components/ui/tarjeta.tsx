import type { ComponentProps } from "react";
import {
  clasesTarjeta,
  type RellenoTarjeta,
  type TonoTarjeta,
} from "./clases";

export type TarjetaProps = ComponentProps<"div"> & {
  tono?: TonoTarjeta;
  relleno?: RellenoTarjeta;
};

export function Tarjeta({
  tono = "neutro",
  relleno = "normal",
  className = "",
  ...props
}: TarjetaProps) {
  return (
    <div
      {...props}
      className={`${clasesTarjeta(tono, relleno)} ${className}`}
    />
  );
}
