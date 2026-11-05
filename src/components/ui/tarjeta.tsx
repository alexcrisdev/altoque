import type { ComponentProps } from "react";

export function Tarjeta({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-borde bg-superficie p-5 text-texto shadow-sm ${className}`}
    />
  );
}