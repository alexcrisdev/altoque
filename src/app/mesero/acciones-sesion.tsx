"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui";
import {
  abrirSesionAction,
  cerrarSesionAction,
} from "@/features/mesero/actions";

const ESTADO_INICIAL = {
  tipo: "inicial" as const,
  mensaje: "",
};

export function BotonAbrirSesion({
  mesaId,
}: {
  mesaId: string;
}) {
  const [estado, action, pendiente] = useActionState(
    abrirSesionAction,
    ESTADO_INICIAL,
  );

  return (
    <form
      action={action}
      className="flex flex-col items-start gap-2"
    >
      <input type="hidden" name="mesaId" value={mesaId} />

      <Boton
        type="submit"
        variante="primario"
        disabled={pendiente}
      >
        {pendiente ? "Abriendo…" : "Abrir sesión"}
      </Boton>

      {estado.mensaje && (
        <p
          role="status"
          className={`text-sm ${
            estado.tipo === "error"
              ? "text-peligro-texto"
              : "text-exito-texto"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

export function BotonCerrarSesion({
  sesionId,
}: {
  sesionId: string;
}) {
  const [estado, action, pendiente] = useActionState(
    cerrarSesionAction,
    ESTADO_INICIAL,
  );

  return (
    <form
      action={action}
      className="flex flex-col items-start gap-2"
      onSubmit={(evento) => {
        if (
          !window.confirm(
            "¿Quieres cerrar la sesión de esta mesa?",
          )
        ) {
          evento.preventDefault();
        }
      }}
    >
      <input
        type="hidden"
        name="sesionId"
        value={sesionId}
      />

      <Boton
        type="submit"
        variante="secundario"
        disabled={pendiente}
      >
        {pendiente ? "Cerrando…" : "Cerrar sesión"}
      </Boton>

      {estado.mensaje && (
        <p
          role="status"
          className={`text-sm ${
            estado.tipo === "error"
              ? "text-peligro-texto"
              : "text-exito-texto"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
