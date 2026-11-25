"use client";

import { Boton, Insignia, MensajeEstado } from "../../components/ui";
import { ImagenProducto } from "../../components/imagen-producto";
import { formatearPrecio } from "../carta/formato";
import type { Producto } from "../carta/tipos";
import type { ItemCarrito } from "./tipos";
import {
  calcularSubtotalCentimos,
  calcularTotalCentimos,
  problemaDeLinea,
} from "./carrito-logica";
import { IconoCandado as Candado } from "../../components/icono-candado";

type Props = {
  items: ItemCarrito[];
  productos: Producto[];
  cantidadMaxima: number;
  observacionesHabilitadas: boolean;
  observacionMaxima: number;
  onCambiarCantidad: (productoId: string, cantidad: number) => void;
  onEliminar: (productoId: string) => void;
  // US-103: «Dejar N» baja la línea a lo que queda hoy.
  onDejarDisponible?: (productoId: string) => void;
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
  onDejarDisponible,
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
              const problema = problemaDeLinea(item, producto);

              return (
                <li
                  key={item.productoId}
                  className="linea-carrito space-y-3 rounded-xl border border-borde bg-superficie p-4"
                  data-problema-stock={problema?.tipo}
                >
                  <div className="flex items-center gap-3">
                    <ImagenProducto
                      src={producto.image_url}
                      nombre={producto.name}
                      decorativa
                      className="size-14 shrink-0 rounded-lg sm:size-16"
                    />
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {producto.name}
                      </h3>
                      <p className="mt-1 text-sm text-texto-suave">
                        Precio unitario: {formatearPrecio(producto.price)}
                      </p>
                    </div>
                  </div>

                  {problema?.tipo === "AGOTADO" && (
                    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-fondo p-3 text-aviso-texto">
                      <Insignia tono="aviso" className="gap-1">
                        <Candado />
                        Agotado
                      </Insignia>

                      <p className="flex-1 text-sm">
                        Se acabó mientras armabas tu pedido.
                      </p>

                      <Boton
                        type="button"
                        variante="secundario"
                        aria-label={`Quitar ${producto.name} del carrito`}
                        onClick={() => onEliminar(item.productoId)}
                      >
                        Quitar
                      </Boton>
                    </div>
                  )}

                  {problema?.tipo === "EXCEDE" && (
                    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-fondo p-3 text-aviso-texto">
                      <p className="flex-1 text-sm font-semibold">
                        Solo quedan {problema.quedan}
                      </p>

                      <Boton
                        type="button"
                        variante="secundario"
                        onClick={() =>
                          onDejarDisponible
                            ? onDejarDisponible(item.productoId)
                            : onCambiarCantidad(item.productoId, problema.quedan)
                        }
                      >
                        Dejar {problema.quedan}
                      </Boton>
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
                        problema !== null ||
                        item.cantidad >= cantidadMaxima ||
                        (typeof producto.quedan === "number" &&
                          item.cantidad >= producto.quedan)
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

                  <p className="text-right font-semibold tabular-nums">
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
