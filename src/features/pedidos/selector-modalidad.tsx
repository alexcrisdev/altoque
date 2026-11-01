"use client";

import { Insignia } from "../../components/ui";
import {
  NOMBRE_MAX,
  type ConfigParaLlevar,
  type Modalidad,
} from "./modalidad";

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

  const claseOpcion =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl " +
    "border border-borde bg-superficie px-3 py-2 text-sm " +
    "has-checked:border-marca has-checked:bg-superficie-suave " +
    "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 " +
    "has-focus-visible:outline-marca";

  const claseEntrada =
    "min-h-11 w-full rounded-xl border border-borde " +
    "bg-superficie px-3 py-2 text-base text-texto " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-marca";

  return (
    <fieldset className="space-y-4 rounded-xl border border-borde bg-superficie p-4 text-texto">
      <legend className="px-1 font-semibold">
        ¿Cómo quieres tu pedido?
      </legend>

      {desdeMesa ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={claseOpcion}>
            <input
              type="radio"
              name="modalidad"
              checked={props.modalidad === "DINE_IN"}
              onChange={() => props.onModalidad("DINE_IN")}
              className="h-4 w-4 shrink-0 accent-marca"
            />

            <span>
              Comer aquí
              {props.mesaNumero
                ? ` (Mesa ${props.mesaNumero})`
                : ""}
            </span>
          </label>

          <label className={claseOpcion}>
            <input
              type="radio"
              name="modalidad"
              checked={props.modalidad === "TAKEAWAY"}
              onChange={() => props.onModalidad("TAKEAWAY")}
              className="h-4 w-4 shrink-0 accent-marca"
            />

            <span>Para llevar</span>
          </label>
        </div>
      ) : (
        <Insignia tono="info">
          Pedido para llevar.
        </Insignia>
      )}

      {props.modalidad === "TAKEAWAY" && (
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Nombre
              {props.config.pideNombre ? "" : " (opcional)"}
            </span>

            <input
              value={props.nombre}
              onChange={(event) =>
                props.onNombre(event.target.value)
              }
              maxLength={NOMBRE_MAX}
              autoComplete="given-name"
              required={props.config.pideNombre}
              className={claseEntrada}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            <span>
              Teléfono
              {props.config.pideTelefono ? "" : " (opcional)"}
            </span>

            <input
              value={props.telefono}
              onChange={(event) =>
                props.onTelefono(event.target.value)
              }
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              required={props.config.pideTelefono}
              className={claseEntrada}
            />
          </label>

          <p className="text-xs text-texto-suave">
            Solo se usan para avisarte cuando tu pedido esté listo.
          </p>
        </div>
      )}
    </fieldset>
  );
}
