import type { ReactNode } from "react";
import { Tarjeta } from "./tarjeta";

export type MensajeEstadoProps = {
  tipo: "vacio" | "error" | "cargando";
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
};

export function MensajeEstado({
  tipo,
  titulo,
  descripcion,
  accion,
}: MensajeEstadoProps) {
  return (
    <Tarjeta
      role={tipo === "error" ? "alert" : "status"}
      aria-busy={tipo === "cargando" ? true : undefined}
    >
      <p
        className={`font-semibold ${
          tipo === "error" ? "text-peligro-texto" : "text-texto"
        }`}
      >
        {titulo}
      </p>

      {descripcion && (
        <p className="mt-2 text-sm text-texto-suave">
          {descripcion}
        </p>
      )}

      {accion && (
        <div className="mt-4">{accion}</div>
      )}
    </Tarjeta>
  );
}