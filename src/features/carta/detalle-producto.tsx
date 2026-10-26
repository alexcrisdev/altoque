"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { formatearPrecio } from "./formato";
import type { Producto } from "./tipos";

type Props = {
  producto: Producto | null;
  dialogoRef: RefObject<HTMLDialogElement | null>;
};

export function DetalleProducto({ producto, dialogoRef }: Props) {
  return (
    <dialog
      ref={dialogoRef}
      aria-labelledby="detalle-producto-titulo"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <form method="dialog" className="mb-4 flex justify-end">
        <button
          type="submit"
          className="rounded-lg border border-gray-300 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          Cerrar detalle
        </button>
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
            className="break-words text-2xl font-bold"
          >
            {producto.name}
          </h2>

          <p className="text-lg font-semibold">
            {formatearPrecio(producto.price)}
          </p>

          {producto.description && (
            <p className="break-words">{producto.description}</p>
          )}

          {!producto.available && (
            <p className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              Agotado
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}