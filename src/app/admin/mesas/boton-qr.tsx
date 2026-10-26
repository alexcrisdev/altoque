"use client";

import Image from "next/image";
import { useActionState } from "react";
import { generarQrAction, type ResultadoQr } from "@/features/acceso-qr/actions";

const inicial: ResultadoQr = { estado: "inicial" };

export function BotonQr({ mesaId, tieneQr }: { mesaId: string; tieneQr: boolean }) {
  const [resultado, accion, pendiente] = useActionState(generarQrAction, inicial);

  return (
    <div className="grid gap-2">
      <form action={accion}>
        <input type="hidden" name="mesaId" value={mesaId} />
        <button
          disabled={pendiente}
          onClick={(evento) => {
            if (tieneQr && !confirm("El QR impreso actual dejará de funcionar. ¿Continuar?")) {
              evento.preventDefault();
            }
          }}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          {pendiente ? "Generando…" : tieneQr ? "Regenerar QR" : "Generar QR"}
        </button>
      </form>

      {resultado.estado === "error" && (
        <p role="alert" className="text-red-700">
          {resultado.mensaje}
        </p>
      )}

      {resultado.estado === "listo" && (
        <div className="grid justify-items-start gap-2 rounded border border-teal-700 p-3">
          <Image
            src={resultado.imagen}
            alt={`QR de la mesa ${resultado.numero}`}
            width={192}
            height={192}
            unoptimized
          />
          <a
            href={resultado.imagen}
            download={`qr-mesa-${resultado.numero}.png`}
            className="font-semibold underline"
          >
            Descargar para imprimir
          </a>
          <p className="text-sm text-zinc-600">
            Guárdalo ahora: por seguridad este QR no se vuelve a mostrar. Si lo pierdes, regenéralo.
          </p>
        </div>
      )}
    </div>
  );
}