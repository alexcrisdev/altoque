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
  const ingredientes = producto?.ingredients?.trim();

  const alergenos = (producto?.allergens ?? [])
    .map((alergeno) => alergeno.trim())
    .filter(Boolean);

  return (
    <dialog
      ref={dialogoRef}
      aria-labelledby="detalle-producto-titulo"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <form method="dialog" className="mb-4 flex justify-end">
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-teal-700"
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

          {ingredientes && (
            <section aria-labelledby="detalle-ingredientes">
              <h3 id="detalle-ingredientes" className="font-semibold">
                Ingredientes
              </h3>
              <p className="mt-1 whitespace-pre-line break-words">
                {ingredientes}
              </p>
            </section>
          )}

          {alergenos.length > 0 && (
            <section
              aria-labelledby="detalle-alergenos"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
            >
              <h3 id="detalle-alergenos" className="font-semibold">
                Advertencias alimentarias
              </h3>
              <p className="mt-1 break-words">
                Contiene: {alergenos.join(", ")}
              </p>
            </section>
          )}

          {!producto.available && (
            <p className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              Agotado
            </p>
          )}

          {/* US-006: aquí se conectarán las acciones del carrito. */}
        </div>
      )}
    </dialog>
  );
}