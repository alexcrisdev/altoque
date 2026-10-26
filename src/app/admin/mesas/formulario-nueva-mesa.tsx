"use client";

import { useActionState } from "react";
import { crearMesaAction, type EstadoNuevaMesa } from "@/features/acceso-qr/actions";
import type { Local } from "@/features/acceso-qr/mesas";

const inicial: EstadoNuevaMesa = { error: null };

export function FormularioNuevaMesa({ locales }: { locales: Local[] }) {
  const [estado, accion, pendiente] = useActionState(crearMesaAction, inicial);

  return (
    <form action={accion} className="mt-6 flex flex-wrap items-end gap-3 rounded border p-4">
      <label className="grid gap-1">
        Local
        <select name="localId" required className="rounded border p-2">
          {locales.map((local) => (
            <option key={local.id} value={local.id}>
              {local.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        N.º de mesa
        <input name="numero" type="number" min={1} max={999} required className="w-24 rounded border p-2" /></label>
      <button
        disabled={pendiente}
        className="rounded bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Agregar mesa"}
      </button>
      {estado.error && (
        <p role="alert" className="w-full text-red-700">
          {estado.error}
        </p>
      )}
    </form>
  );
}