"use client";

import { useActionState } from "react";
import type { ConfigParaLlevar } from "@/features/pedidos/modalidad";
import {
  guardarConfigParaLlevarAction,
  type EstadoConfigParaLlevar,
} from "@/features/pedidos/para-llevar-actions";

const inicial: EstadoConfigParaLlevar = { tipo: "inicial", mensaje: "" };

export function FormularioParaLlevar({ config }: { config: ConfigParaLlevar }) {
  const [estado, accion, pendiente] = useActionState(guardarConfigParaLlevarAction, inicial);

  return (
    <form action={accion} className="mt-6 grid gap-4 rounded-xl border p-4">
      <p className="font-semibold">Datos que se le piden al cliente en un pedido para llevar</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="pideNombre" defaultChecked={config.pideNombre} />
        Nombre obligatorio
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="pideTelefono" defaultChecked={config.pideTelefono} />
        Teléfono obligatorio
      </label>
      <p className="text-sm text-zinc-600">
        Si un dato no es obligatorio, el cliente igual puede dejarlo si quiere.
      </p>
      <button
        disabled={pendiente}
        className="min-h-11 justify-self-start rounded bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} className={estado.tipo === "error" ? "text-red-700" : "text-teal-800"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
