"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatearPrecio } from "./formato";
import { DetalleProducto } from "./detalle-producto";
import { PanelCarrito } from "../pedidos/panel-carrito";
import {
  agregarAlCarrito,
  cambiarCantidad as actualizarCantidad,
  quitarDelCarrito,
  cambiarObservacion as actualizarObservacion,
} from "../pedidos/carrito-logica";
import { LIMITES, type ItemCarrito } from "../pedidos/tipos";
import type { CategoriaConProductos, Producto } from "./tipos";

type Props = {
  categorias: CategoriaConProductos[];
  observacionesHabilitadas?: boolean;
};

export function CartaInteractiva({
  categorias,
  observacionesHabilitadas = false,
}: Props) {
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [aviso, setAviso] = useState("");
  const itemsAnteriores = useRef<ItemCarrito[]>([]);

  const productos = useMemo(
    () => categorias.flatMap((categoria) => categoria.productos),
    [categorias],
  );

  // Notifica únicamente los aumentos efectivos del carrito.
  useEffect(() => {
    const anteriores = itemsAnteriores.current;
    itemsAnteriores.current = items;

    const incrementado = items.find((item) => {
      const anterior = anteriores.find(
        (previo) => previo.productoId === item.productoId,
      );

      return item.cantidad > (anterior?.cantidad ?? 0);
    });

    if (!incrementado) return;

    const producto = productos.find(
      (producto) => producto.id === incrementado.productoId,
    );

    if (!producto) return;

    const temporizador = window.setTimeout(() => {
      setAviso(
        `${producto.name}: ${incrementado.cantidad} ${
          incrementado.cantidad === 1 ? "unidad" : "unidades"
        } en el carrito.`,
      );
    }, 0);

    return () => window.clearTimeout(temporizador);
  }, [items, productos]);

  useEffect(() => {
    if (!aviso) return;

    const temporizador = window.setTimeout(() => {
      setAviso("");
    }, 3000);

    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  function abrirDetalle(producto: Producto) {
    setAviso("");
    setSeleccionado(producto);
    dialogo.current?.showModal();
  }

  function agregarProducto(producto: Producto) {
    setItems((actuales) => agregarAlCarrito(actuales, producto));
  }

  function cambiarCantidad(productoId: string, cantidad: number) {
    const producto = productos.find(
      (producto) => producto.id === productoId,
    );

    if (!producto) return;

    setItems((actuales) =>
      actualizarCantidad(actuales, producto, cantidad),
    );
  }

  function eliminarProducto(productoId: string) {
    setItems((actuales) =>
      quitarDelCarrito(actuales, productoId),
    );

    setAviso("");
  }

  function cambiarObservacion(
    productoId: string,
    observacion: string,
  ) {
    setItems((actuales) =>
      actualizarObservacion(
        actuales,
        productoId,
        observacion,
        observacionesHabilitadas,
      ),
    );
  }

  return (
    <div className="pt-4 pb-28">
      <nav
        aria-label="Categorías de la carta"
        className="sticky top-0 z-10 -mx-1 mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 bg-background px-1 py-3"
      >
        {categorias.map((categoria) => (
          <a
            key={categoria.id}
            href={`#categoria-${categoria.id}`}
            className="shrink-0 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {categoria.name}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {categorias.map((categoria) => (
          <section
            key={categoria.id}
            id={`categoria-${categoria.id}`}
            aria-labelledby={`titulo-${categoria.id}`}
            className="scroll-mt-24"
          >
            <h2
              id={`titulo-${categoria.id}`}
              className="mb-3 text-xl font-bold"
            >
              {categoria.name}
            </h2>

            <ul className="grid gap-3">
              {categoria.productos.map((producto) => (
                <li key={producto.id}>
                  <button
                    type="button"
                    onClick={() => abrirDetalle(producto)}
                    aria-haspopup="dialog"
                    className="flex w-full gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    {producto.image_url && (
                      <Image
                        src={producto.image_url}
                        alt={producto.name}
                        width={88}
                        height={88}
                        unoptimized
                        className="h-22 w-22 shrink-0 rounded-lg object-cover"
                      />
                    )}

                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="block break-words font-semibold">
                        {producto.name}
                      </span>

                      {producto.description && (
                        <span className="block break-words text-sm opacity-80">
                          {producto.description}
                        </span>
                      )}

                      <span className="block font-semibold">
                        {formatearPrecio(producto.price)}
                      </span>

                      {!producto.available && (
                        <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                          Agotado
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <PanelCarrito
        items={items}
        productos={productos}
        cantidadMaxima={LIMITES.cantidadMax}
        observacionesHabilitadas={observacionesHabilitadas}
        observacionMaxima={LIMITES.observacionMax}
        onCambiarCantidad={cambiarCantidad}
        onEliminar={eliminarProducto}
        onCambiarObservacion={cambiarObservacion}
      />

      <DetalleProducto
        producto={seleccionado}
        dialogoRef={dialogo}
        onAgregar={agregarProducto}
        aviso={aviso}
      />

      <div
        role="status"
        aria-atomic="true"
        className={
          aviso
            ? "pointer-events-none fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-xl border border-teal-600 bg-background px-4 py-3 text-sm font-medium text-foreground shadow-lg"
            : "sr-only"
        }
      >
        {aviso}
      </div>
    </div>
  );
}