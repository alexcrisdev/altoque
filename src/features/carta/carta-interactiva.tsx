"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatearPrecio } from "./formato";
import { DetalleProducto } from "./detalle-producto";
import { PanelCarrito } from "../pedidos/panel-carrito";
import { cantidadValida } from "../pedidos/carrito-logica";
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

  const productos = categorias.flatMap(
    (categoria) => categoria.productos,
  );

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
    if (!producto.available) {
      setAviso("Este producto está agotado.");
      return;
    }

    const existente = items.find(
      (item) => item.productoId === producto.id,
    );

    if (existente && existente.cantidad >= LIMITES.cantidadMax) {
      setAviso(
        `Puedes agregar hasta ${LIMITES.cantidadMax} unidades por producto.`,
      );
      return;
    }

    if (!existente && items.length >= LIMITES.itemsMax) {
      setAviso(
        `Puedes agregar hasta ${LIMITES.itemsMax} productos distintos.`,
      );
      return;
    }

    setItems((actuales) => {
      const encontrado = actuales.find(
        (item) => item.productoId === producto.id,
      );

      if (encontrado) {
        if (encontrado.cantidad >= LIMITES.cantidadMax) {
          return actuales;
        }

        return actuales.map((item) =>
          item.productoId === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item,
        );
      }

      if (actuales.length >= LIMITES.itemsMax) {
        return actuales;
      }

      return [
        ...actuales,
        {
          productoId: producto.id,
          cantidad: LIMITES.cantidadMin,
          observacion: null,
        },
      ];
    });

    const cantidadNueva = existente
      ? existente.cantidad + 1
      : LIMITES.cantidadMin;

    setAviso(
      `${producto.name} agregado al carrito. Cantidad: ${cantidadNueva}.`,
    );
  }

  function cambiarCantidad(productoId: string, cantidad: number) {
    if (!cantidadValida(cantidad, LIMITES.cantidadMax)) {
      setAviso(
        `La cantidad debe estar entre 1 y ${LIMITES.cantidadMax}.`,
      );
      return;
    }

    const producto = productos.find(
      (producto) => producto.id === productoId,
    );

    if (!producto) {
      setAviso("Este producto ya no está en la carta.");
      return;
    }

    setItems((actuales) =>
      actuales.map((item) => {
        if (item.productoId !== productoId) {
          return item;
        }

        if (!producto.available && cantidad > item.cantidad) {
          return item;
        }

        return { ...item, cantidad };
      }),
    );

    setAviso("");
  }

  function eliminarProducto(productoId: string) {
    setItems((actuales) =>
      actuales.filter((item) => item.productoId !== productoId),
    );

    setAviso("");
  }

  function cambiarObservacion(
    productoId: string,
    observacion: string,
  ) {
    if (!observacionesHabilitadas) {
      return;
    }

    if (observacion.length > LIMITES.observacionMax) {
      setAviso(
        `La observación admite hasta ${LIMITES.observacionMax} caracteres.`,
      );
      return;
    }

    setItems((actuales) =>
      actuales.map((item) =>
        item.productoId === productoId
          ? {
              ...item,
              observacion: observacion === "" ? null : observacion,
            }
          : item,
      ),
    );

    setAviso("");
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
