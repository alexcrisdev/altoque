import type { ComponentProps } from "react";
import {
  clasesInsignia,
  type TonoInsignia,
} from "./clases";

export type { TonoInsignia } from "./clases";

export type InsigniaProps = ComponentProps<"span"> & {
  tono?: TonoInsignia;
};

export function Insignia({
  tono = "neutro",
  className = "",
  ...props
}: InsigniaProps) {
  return (
    <span
      {...props}
      className={`${clasesInsignia(tono)} ${className}`}
    />
  );
}