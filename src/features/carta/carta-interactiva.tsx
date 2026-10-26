"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { formatearPrecio } from "./formato";
import type { CategoriaConProductos, Producto } from "./tipos";

export function CartaInteractiva({ categorias }: { categorias: CategoriaConProductos[] }) {
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  function abrirDetalle(producto: Producto) {
    setSeleccionado(producto);
    dialogo.current?.showModal();
  }

  return (
    <div className="pt-4">
      <nav aria-label="Categorías de la carta" className="sticky top-0 z-10 -mx-1 mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 bg-background px-1 py-3">
        {categorias.map((categoria) => (
          <a key={categoria.id} href={`#categoria-${categoria.id}`} className="shrink-0 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            {categoria.name}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {categorias.map((categoria) => (
          <section key={categoria.id} id={`categoria-${categoria.id}`} aria-labelledby={`titulo-${categoria.id}`} className="scroll-mt-24">
            <h2 id={`titulo-${categoria.id}`} className="mb-3 text-xl font-bold">{categoria.name}</h2>
            <ul className="grid gap-3">
              {categoria.productos.map((producto) => (
                <li key={producto.id}>
                  <button type="button" onClick={() => abrirDetalle(producto)} aria-haspopup="dialog" className="flex w-full gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                    {producto.image_url && (
                      <Image src={producto.image_url} alt={producto.name} width={88} height={88} unoptimized className="h-22 w-22 shrink-0 rounded-lg object-cover" />
                    )}
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="block break-words font-semibold">{producto.name}</span>
                      {producto.description && <span className="block break-words text-sm opacity-80">{producto.description}</span>}
                      <span className="block font-semibold">{formatearPrecio(producto.price)}</span>
                      {!producto.available && <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">Agotado</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <dialog ref={dialogo} aria-labelledby="detalle-producto-titulo" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50">
        <form method="dialog" className="mb-4 flex justify-end">
          <button className="rounded-lg border border-gray-300 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Cerrar detalle</button>
        </form>
        {seleccionado && (
          <div className="space-y-4">
            {seleccionado.image_url && (
              <Image src={seleccionado.image_url} alt={seleccionado.name} width={600} height={400} unoptimized className="max-h-72 w-full rounded-xl object-cover" />
            )}
            <h2 id="detalle-producto-titulo" className="break-words text-2xl font-bold">{seleccionado.name}</h2>
            <p className="text-lg font-semibold">{formatearPrecio(seleccionado.price)}</p>
            {seleccionado.description && <p className="break-words">{seleccionado.description}</p>}
            {!seleccionado.available && <p className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">Agotado</p>}
          </div>
        )}
      </dialog>
    </div>
  );
}
