"use client";

import { useActionState } from "react";
import { abrirSesionAction, cerrarSesionAction } from "@/features/mesero/actions";

const ESTADO_INICIAL = { tipo: "inicial" as const, mensaje: "" };

export function BotonAbrirSesion({ mesaId }: { mesaId: string }) {
  const [estado, action, pendiente] = useActionState(abrirSesionAction, ESTADO_INICIAL);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="mesaId" value={mesaId} />
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pendiente ? "Abriendo…" : "Abrir sesión"}
      </button>
      {estado.mensaje && (
        <p role="status" className={estado.tipo === "error" ? "text-sm text-red-700" : "text-sm text-emerald-800"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

export function BotonCerrarSesion({ sesionId }: { sesionId: string }) {
  const [estado, action, pendiente] = useActionState(cerrarSesionAction, ESTADO_INICIAL);

  return (
    <form
      action={action}
      className="flex flex-col items-start gap-2"
      onSubmit={(evento) => {
        if (!window.confirm("¿Quieres cerrar la sesión de esta mesa?")) evento.preventDefault();
      }}
    >
      <input type="hidden" name="sesionId" value={sesionId} />
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 rounded-lg border border-zinc-400 px-4 py-2 font-medium disabled:opacity-60"
      >
        {pendiente ? "Cerrando…" : "Cerrar sesión"}
      </button>
      {estado.mensaje && (
        <p role="status" className={estado.tipo === "error" ? "text-sm text-red-700" : "text-sm text-emerald-800"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
