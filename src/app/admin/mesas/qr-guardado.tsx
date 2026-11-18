"use client";

import Image from "next/image";
import { useState } from "react";
import { Boton, MensajeEstado, clasesBoton } from "@/components/ui";

type Props =
  | { estado: "visible"; etiqueta: string; url: string; imagen: string }
  | { estado: "antiguo"; etiqueta: string };

// Nombre del archivo PNG.
export function nombreArchivoQr(etiqueta: string): string {
  return etiqueta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// US-096: el QR activo se ve siempre, sin tener que regenerarlo ni reimprimirlo.
export function QrGuardado(props: Props) {
  const [copiado, setCopiado] = useState<"si" | "error" | null>(null);

  if (props.estado === "antiguo") {
    return (
      <MensajeEstado
        tipo="vacio"
        titulo="QR antiguo: regenéralo una vez"
        descripcion="Este QR se creó antes de que AlToque los guardara. Sigue funcionando, pero para verlo aquí hay que regenerarlo una vez (el impreso dejará de servir)."
      />
    );
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado("si");
    } catch {
      setCopiado("error");
    }
  }

  return (
    <div className="grid justify-items-start gap-3">
      <Image
        src={props.imagen}
        alt={`QR de ${props.etiqueta}`}
        width={160}
        height={160}
        unoptimized
      />

      <div className="flex flex-wrap gap-2">
        <Boton type="button" variante="secundario" onClick={() => copiar(props.url)}>
          Copiar enlace
        </Boton>

        <a
          href={props.imagen}
          download={`qr-${nombreArchivoQr(props.etiqueta)}.png`}
          className={clasesBoton("primario", "md")}
        >
          Descargar PNG
        </a>

        <a
          href={props.url}
          target="_blank"
          rel="noreferrer"
          className={clasesBoton("secundario", "md")}
        >
          Probar
        </a>
      </div>

      <p className="text-sm text-texto-suave" role="status" aria-live="polite">
        {copiado === "si" && "Enlace copiado."}
        {copiado === "error" && "No se pudo copiar. Mantén presionado el botón Probar y copia el enlace."}
      </p>
    </div>
  );
}
