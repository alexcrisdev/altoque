"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  Boton,
  MensajeEstado,
  Tarjeta,
  clasesBoton,
} from "@/components/ui";
import type { ResultadoQr } from "@/features/acceso-qr/actions";

const inicial: ResultadoQr = { estado: "inicial" };

type Props = {
  // Acción del servidor que genera el QR (de mesa o de mostrador).
  generar: (
    anterior: ResultadoQr,
    formData: FormData,
  ) => Promise<ResultadoQr>;
  // Campo oculto que identifica qué se genera.
  campo: "mesaId" | "localId";
  valor: string;
  tieneQr: boolean;
};

// Nombre del archivo PNG.
function nombreArchivo(etiqueta: string): string {
  return etiqueta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function BotonQr({
  generar,
  campo,
  valor,
  tieneQr,
}: Props) {
  const [resultado, accion, pendiente] = useActionState(
    generar,
    inicial,
  );

  return (
    <div className="grid gap-3">
      <form action={accion}>
        <input type="hidden" name={campo} value={valor} />

        <Boton
          type="submit"
          variante="secundario"
          disabled={pendiente}
          onClick={(evento) => {
            if (
              tieneQr &&
              !confirm(
                "El QR impreso actual dejará de funcionar. ¿Continuar?",
              )
            ) {
              evento.preventDefault();
            }
          }}
        >
          {pendiente
            ? "Generando…"
            : tieneQr
              ? "Regenerar QR"
              : "Generar QR"}
        </Boton>
      </form>

      {resultado.estado === "error" && (
        <MensajeEstado
          tipo="error"
          titulo={resultado.mensaje}
        />
      )}

      {resultado.estado === "listo" && (
        <Tarjeta className="grid justify-items-start gap-3">
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
            className={clasesBoton("primario", "md")}
          >
            Descargar para imprimir
          </a>

          <a
            href={resultado.url}
            target="_blank"
            rel="noreferrer"
            className={clasesBoton("secundario", "md")}
          >
            Probar enlace
          </a>

          <p className="text-sm text-texto-suave">
            Guárdalo ahora: por seguridad este QR no se vuelve a
            mostrar. Si lo pierdes, regenéralo.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}
