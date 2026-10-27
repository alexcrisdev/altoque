"use client";

import { formatearPrecio } from "../carta/formato";
import type { Producto } from "../carta/tipos";
import type { ItemCarrito } from "./tipos";
import {
  calcularSubtotalCentimos,
  calcularTotalCentimos,
} from "./carrito-logica";

type Props = {
  items: ItemCarrito[];
  productos: Producto[];
  cantidadMaxima: number;
  observacionesHabilitadas: boolean;
  observacionMaxima: number;
  onCambiarCantidad: (productoId: string, cantidad: number) => void;
  onEliminar: (productoId: string) => void;
  onCambiarObservacion: (
    productoId: string,
    observacion: string,
  ) => void;
  enPanel?: boolean;
};

export function Carrito({
  items,
  productos,
  cantidadMaxima,
  observacionesHabilitadas,
  observacionMaxima,
  onCambiarCantidad,
  onEliminar,
  enPanel = false,
  onCambiarObservacion,
}: Props) {
  const productosPorId = new Map(
    productos.map((producto) => [producto.id, producto]),
  );

  const hayProductosAusentes = items.some(
    (item) => !productosPorId.has(item.productoId),
  );

  return (
    <section
      aria-labelledby="carrito-titulo"
      className={enPanel ? "space-y-4" : "mt-8 rounded-xl border border-gray-300 p-4"}
    >
      <h2 id="carrito-titulo" className="text-xl font-bold">
        Tu carrito
      </h2>

      {items.length === 0 ? (
        <p className="mt-3">Todavía no agregaste productos.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-4">
            {items.map((item) => {
              const producto = productosPorId.get(item.productoId);

              if (!producto) {
                return (
                  <li key={item.productoId} className="space-y-2">
                    <p role="alert">
                      Un producto ya no aparece en la carta. Elimínalo
                      para actualizar el total.
                    </p>
                    <button
                      type="button"
                      onClick={() => onEliminar(item.productoId)}
                      className="min-h-11 rounded-lg border px-3 py-2"
                    >
                      Eliminar producto
                    </button>
                  </li>
                );
              }

              const subtotal = calcularSubtotalCentimos(
                producto.price,
                item.cantidad,
              );

              return (
                <li
                  key={item.productoId}
                  className="space-y-3 border-b border-gray-300 pb-4"
                >
                  <h3 className="break-words font-semibold">
                    {producto.name}
                  </h3>

                  <p>
                    Precio unitario: {formatearPrecio(producto.price)}
                  </p>

                  {!producto.available && (
                    <p role="status">
                      Este producto está agotado. Puedes eliminarlo.
                    </p>
                  )}

                  <div
                    role="group"
                    aria-label={`Cantidad de ${producto.name}`}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <button
                      type="button"
                      aria-label={`Disminuir cantidad de ${producto.name}`}
                      disabled={item.cantidad <= 1}
                      onClick={() =>
                        onCambiarCantidad(
                          item.productoId,
                          item.cantidad - 1,
                        )
                      }
                      className="min-h-11 min-w-11 rounded-lg border disabled:opacity-40"
                    >
                      −
                    </button>

                    <span>{item.cantidad}</span>

                    <button
                      type="button"
                      aria-label={`Aumentar cantidad de ${producto.name}`}
                      disabled={
                        !producto.available ||
                        item.cantidad >= cantidadMaxima
                      }
                      onClick={() =>
                        onCambiarCantidad(
                          item.productoId,
                          item.cantidad + 1,
                        )
                      }
                      className="min-h-11 min-w-11 rounded-lg border disabled:opacity-40"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      aria-label={`Eliminar ${producto.name} del carrito`}
                      onClick={() => onEliminar(item.productoId)}
                      className="min-h-11 rounded-lg border px-3 py-2"
                    >
                      Eliminar
                    </button>
                  </div>

                  {observacionesHabilitadas && (
                    <div>
                      <label
                        htmlFor={`observacion-${item.productoId}`}
                        className="block font-medium"
                      >
                        Observaciones para {producto.name}
                      </label>

                      <textarea
                        id={`observacion-${item.productoId}`}
                        value={item.observacion ?? ""}
                        maxLength={observacionMaxima}
                        onChange={(event) =>
                          onCambiarObservacion(
                            item.productoId,
                            event.target.value,
                          )
                        }
                        rows={2}
                        className="mt-2 w-full rounded-lg border border-gray-400 bg-background p-3 text-foreground"
                      />

                      <p className="text-sm opacity-75">
                        {item.observacion?.length ?? 0}/
                        {observacionMaxima} caracteres
                      </p>
                    </div>
                  )}

                  <p className="font-semibold">
                    Subtotal: {formatearPrecio(subtotal / 100)}
                  </p>
                </li>
              );
            })}
          </ul>

            {!enPanel && (
              <p
                aria-live="polite"
                aria-atomic="true"
                className="mt-4 text-lg font-bold"
              >
                {hayProductosAusentes
                  ? "Total pendiente de actualizar"
                  : `Total: ${formatearPrecio(
                    calcularTotalCentimos(items, productos) / 100,
                    )}`}
              </p>
          )}
        </>
      )}
    </section>
  );
}