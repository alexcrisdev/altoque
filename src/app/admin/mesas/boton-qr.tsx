"use client";

import Image from "next/image";
import { useActionState } from "react";
import type { ResultadoQr } from "@/features/acceso-qr/actions";

const inicial: ResultadoQr = { estado: "inicial" };

type Props = {
  // Acción del servidor que genera el QR (de mesa o de mostrador).
  generar: (anterior: ResultadoQr, formData: FormData) => Promise<ResultadoQr>;
  // Campo oculto que identifica qué se genera: "mesaId" o "localId".
  campo: "mesaId" | "localId";
  valor: string;
  tieneQr: boolean;
};

// "mostrador Local Centro" -> "mostrador-local-centro" (nombre del archivo PNG)
function nombreArchivo(etiqueta: string): string {
  return etiqueta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function BotonQr({ generar, campo, valor, tieneQr }: Props) {
  const [resultado, accion, pendiente] = useActionState(generar, inicial);

  return (
    <div className="grid gap-2">
      <form action={accion}>
        <input type="hidden" name={campo} value={valor} />
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
            alt={`QR de ${resultado.etiqueta}`}
            width={192}
            height={192}
            unoptimized
          />
          <a
            href={resultado.imagen}
            download={`qr-${nombreArchivo(resultado.etiqueta)}.png`}
            className="font-semibold underline"
          >
            Descargar para imprimir
          </a>
          <a href={resultado.url} target="_blank" rel="noreferrer" className="text-sm underline">
            Probar enlace
          </a>
          <p className="text-sm text-zinc-600">
            Guárdalo ahora: por seguridad este QR no se vuelve a mostrar. Si lo pierdes, regenéralo.
          </p>
        </div>
      )}
    </div>
  );
}