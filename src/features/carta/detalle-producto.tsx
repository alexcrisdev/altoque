"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { Boton, Insignia } from "../../components/ui";
import { formatearPrecio } from "./formato";
import type { Producto } from "./tipos";

type Props = {
  producto: Producto | null;
  dialogoRef: RefObject<HTMLDialogElement | null>;
  onAgregar: (producto: Producto) => void;
  aviso: string;
};

export function DetalleProducto({
  producto,
  dialogoRef,
  onAgregar,
  aviso,
}: Props) {
  const ingredientes = producto?.ingredients?.trim();

  const alergenos = (producto?.allergens ?? [])
    .map((alergeno) => alergeno.trim())
    .filter(Boolean);

  return (
    <dialog
      ref={dialogoRef}
      aria-labelledby="detalle-producto-titulo"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-borde bg-superficie p-6 text-texto shadow-xl backdrop:bg-black/50"
    >
      <form method="dialog" className="mb-4 flex justify-end">
        <Boton type="submit" variante="secundario">
          Cerrar detalle
        </Boton>
      </form>

      {producto && (
        <div className="space-y-4">
          {producto.image_url && (
            <Image
              src={producto.image_url}
              alt={producto.name}
              width={600}
              height={400}
              unoptimized
              className="max-h-72 w-full rounded-xl object-cover"
            />
          )}

          <h2
            id="detalle-producto-titulo"
            className="break-words text-2xl font-bold text-texto"
          >
            {producto.name}
          </h2>

          <p className="text-lg font-semibold text-texto">
            {formatearPrecio(producto.price)}
          </p>

          {producto.description && (
            <p className="break-words text-texto-suave">
              {producto.description}
            </p>
          )}

          {ingredientes && (
            <section aria-labelledby="detalle-ingredientes">
              <h3
                id="detalle-ingredientes"
                className="font-semibold text-texto"
              >
                Ingredientes
              </h3>

              <p className="mt-1 whitespace-pre-line break-words text-texto-suave">
                {ingredientes}
              </p>
            </section>
          )}

          {alergenos.length > 0 && (
            <section
              aria-labelledby="detalle-alergenos"
              className="rounded-xl border border-aviso-borde bg-aviso-fondo p-4 text-aviso-texto"
            >
              <h3
                id="detalle-alergenos"
                className="font-semibold"
              >
                Advertencias alimentarias
              </h3>

              <p className="mt-1 break-words">
                Contiene: {alergenos.join(", ")}
              </p>
            </section>
          )}

          {!producto.available && (
            <Insignia tono="neutro">
              Agotado
            </Insignia>
          )}

          <Boton
            type="button"
            variante="primario"
            tamano="lg"
            disabled={!producto.available}
            onClick={() => onAgregar(producto)}
            className="w-full"
          >
            {producto.available
              ? "Agregar al carrito"
              : "Producto agotado"}
          </Boton>

          <p role="status" className="text-sm text-texto-suave">
            {aviso}
          </p>
        </div>
      )}
    </dialog>
  );
}