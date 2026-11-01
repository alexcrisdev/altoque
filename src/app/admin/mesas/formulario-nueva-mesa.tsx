"use client";

import { useActionState } from "react";
import { Boton, MensajeEstado, Tarjeta } from "@/components/ui";
import {
  crearMesaAction,
  type EstadoNuevaMesa,
} from "@/features/acceso-qr/actions";
import type { Local } from "@/features/acceso-qr/mesas";

const inicial: EstadoNuevaMesa = { error: null };

export function FormularioNuevaMesa({
  locales,
}: {
  locales: Local[];
}) {
  const [estado, accion, pendiente] = useActionState(
    crearMesaAction,
    inicial,
  );

  return (
    <Tarjeta className="mt-6">
      <form
        action={accion}
        className="flex flex-wrap items-end gap-4"
      >
        <label className="grid gap-2 text-sm font-medium">
          Local

          <select
            name="localId"
            required
            className="min-h-11 rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            {locales.map((local) => (
              <option key={local.id} value={local.id}>
                {local.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          N.º de mesa

          <input
            name="numero"
            type="number"
            min={1}
            max={999}
            required
            className="min-h-11 w-24 rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          />
        </label>

        <Boton
          type="submit"
          variante="primario"
          disabled={pendiente}
        >
          {pendiente ? "Creando…" : "Agregar mesa"}
        </Boton>

        {estado.error && (
          <div className="w-full">
            <MensajeEstado
              tipo="error"
              titulo={estado.error}
            />
          </div>
        )}
      </form>
    </Tarjeta>
  );
}
