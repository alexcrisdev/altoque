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
      tono={tipo === "error" ? "peligro" : tipo === "vacio" ? "suave" : "neutro"}
      className={tipo === "error" ? "border-l-4 border-l-peligro" : tipo === "cargando" ? "border-l-4 border-l-marca" : "border-dashed"}
    >
      <span aria-hidden="true" className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold ${tipo === "error" ? "bg-superficie text-peligro-texto" : "bg-superficie text-marca"}`}>
        {tipo === "error" ? "!" : tipo === "cargando" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-borde border-t-marca" /> : "—"}
      </span>
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
