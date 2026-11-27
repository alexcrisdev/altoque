"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui";
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
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-borde px-3 py-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca">
        <input type="checkbox" name="pideNombre" defaultChecked={config.pideNombre} className="h-5 w-5 accent-marca" />
        Nombre obligatorio
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-borde px-3 py-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca">
        <input type="checkbox" name="pideTelefono" defaultChecked={config.pideTelefono} className="h-5 w-5 accent-marca" />
        Teléfono obligatorio
      </label>
      <p className="text-sm text-texto-suave">
        Si un dato no es obligatorio, el cliente igual puede dejarlo si quiere.
      </p>
      <Boton
        type="submit"
        tamano="propio"
        esquina="sm"
        cargando={pendiente}
        className="justify-self-start px-4 py-2 font-semibold"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} className={estado.tipo === "error" ? "text-peligro-texto" : "text-exito-texto"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
