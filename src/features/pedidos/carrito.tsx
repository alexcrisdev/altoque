"use client";

import { Boton, Insignia, MensajeEstado } from "../../components/ui";
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
      className={
        enPanel
          ? "space-y-4 text-texto"
          : "mt-8 space-y-4 rounded-2xl border border-borde bg-superficie p-5 text-texto"
      }
    >
      <h2 id="carrito-titulo" className="text-xl font-bold">
        Tu carrito
      </h2>

      {items.length === 0 ? (
        <MensajeEstado
          tipo="vacio"
          titulo="Todavía no agregaste productos."
        />
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((item) => {
              const producto = productosPorId.get(item.productoId);

              if (!producto) {
                return (
                  <li key={item.productoId}>
                    <MensajeEstado
                      tipo="error"
                      titulo="Un producto ya no aparece en la carta."
                      descripcion="Elimínalo para actualizar el total."
                      accion={
                        <Boton
                          type="button"
                          variante="peligro"
                          onClick={() => onEliminar(item.productoId)}
                        >
                          Eliminar producto
                        </Boton>
                      }
                    />
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
                  className="space-y-3 border-b border-borde pb-4"
                >
                  <h3 className="break-words font-semibold">
                    {producto.name}
                  </h3>

                  <p className="text-sm text-texto-suave">
                    Precio unitario: {formatearPrecio(producto.price)}
                  </p>

                  {!producto.available && (
                    <div role="status" className="space-y-2">
                      <Insignia tono="aviso">
                        Agotado
                      </Insignia>

                      <p className="text-sm text-texto-suave">
                        Este producto está agotado. Puedes eliminarlo.
                      </p>
                    </div>
                  )}

                  <div
                    role="group"
                    aria-label={`Cantidad de ${producto.name}`}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <Boton
                      type="button"
                      variante="secundario"
                      aria-label={`Disminuir cantidad de ${producto.name}`}
                      disabled={item.cantidad <= 1}
                      onClick={() =>
                        onCambiarCantidad(
                          item.productoId,
                          item.cantidad - 1,
                        )
                      }
                      className="min-w-11"
                    >
                      −
                    </Boton>

                    <span className="min-w-5 text-center font-semibold">
                      {item.cantidad}
                    </span>

                    <Boton
                      type="button"
                      variante="secundario"
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
                      className="min-w-11"
                    >
                      +
                    </Boton>

                    <Boton
                      type="button"
                      variante="peligro"
                      aria-label={`Eliminar ${producto.name} del carrito`}
                      onClick={() => onEliminar(item.productoId)}
                    >
                      Eliminar
                    </Boton>
                  </div>

                  {observacionesHabilitadas && (
                    <div>
                      <label
                        htmlFor={`observacion-${item.productoId}`}
                        className="block text-sm font-medium"
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
                        className="mt-2 w-full rounded-xl border border-borde bg-superficie p-3 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                      />

                      <p className="mt-1 text-sm text-texto-suave">
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
              className="text-lg font-bold"
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
