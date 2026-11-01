import type { ReactNode } from "react";

export type EncabezadoPantallaProps = {
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
};

export function EncabezadoPantalla({
  titulo,
  subtitulo,
  acciones,
}: EncabezadoPantallaProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold text-texto">
          {titulo}
        </h1>

        {subtitulo && (
          <p className="mt-2 text-sm text-texto-suave">
            {subtitulo}
          </p>
        )}
      </div>

      {acciones && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acciones}
        </div>
      )}
    </header>
  );
}