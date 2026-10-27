"use client";

import { NOMBRE_MAX, type ConfigParaLlevar, type Modalidad } from "./modalidad";

type Props = {
  modalidadQr: Modalidad;
  mesaNumero: number | null;
  config: ConfigParaLlevar;
  modalidad: Modalidad;
  nombre: string;
  telefono: string;
  onModalidad: (modalidad: Modalidad) => void;
  onNombre: (nombre: string) => void;
  onTelefono: (telefono: string) => void;
};

// El cliente elige antes de confirmar y puede cambiar de opinión hasta enviar.
export function SelectorModalidad(props: Props) {
  const desdeMesa = props.modalidadQr === "DINE_IN";

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-300 p-3">
      <legend className="px-1 font-semibold">¿Cómo quieres tu pedido?</legend>

      {desdeMesa ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
            <input
              type="radio"
              name="modalidad"
              checked={props.modalidad === "DINE_IN"}
              onChange={() => props.onModalidad("DINE_IN")}
            />
            Comer aquí{props.mesaNumero ? ` (Mesa ${props.mesaNumero})` : ""}
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
            <input
              type="radio"
              name="modalidad"
              checked={props.modalidad === "TAKEAWAY"}
              onChange={() => props.onModalidad("TAKEAWAY")}
            />
            Para llevar
          </label>
        </div>
      ) : (
        <p className="text-sm">Pedido para llevar.</p>
      )}

      {props.modalidad === "TAKEAWAY" && (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm">
            Nombre{props.config.pideNombre ? "" : " (opcional)"}
            <input
              value={props.nombre}
              onChange={(e) => props.onNombre(e.target.value)}
              maxLength={NOMBRE_MAX}
              autoComplete="given-name"
              required={props.config.pideNombre}
              className="rounded border p-2 text-base"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Teléfono{props.config.pideTelefono ? "" : " (opcional)"}
            <input
              value={props.telefono}
              onChange={(e) => props.onTelefono(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              required={props.config.pideTelefono}
              className="rounded border p-2 text-base"
            />
          </label>
          <p className="text-xs text-zinc-600">Solo se usan para avisarte cuando tu pedido esté listo.</p>
        </div>
      )}
    </fieldset>
  );
}
