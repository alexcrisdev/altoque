"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import {
  Boton,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "../../components/ui";
import { Carrito } from "./carrito";
import { calcularTotalCentimos } from "./carrito-logica";
import { formatearPrecio } from "../carta/formato";
import type { ResultadoRegistroPedido } from "./actions";

type Props = Omit<ComponentProps<typeof Carrito>, "enPanel"> & {
  pedidosHabilitados: boolean;
  enviando: boolean;
  resultado: ResultadoRegistroPedido | null;
  onConfirmar: () => void;
  // US-002: selector de modalidad y datos para llevar.
  opciones?: ReactNode;
  // Qué dato falta para poder confirmar (null si está completo).
  faltaDato?: string | null;
};

export function PanelCarrito(props: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);

  const unidades = props.items.reduce(
    (total, item) => total + item.cantidad,
    0,
  );

  const productosDisponibles = new Set(
    props.productos.map((producto) => producto.id),
  );

  const hayProductosAusentes = props.items.some(
    (item) => !productosDisponibles.has(item.productoId),
  );

  const total = hayProductosAusentes
    ? null
    : calcularTotalCentimos(props.items, props.productos);

  const totalFormateado =
    total === null
      ? "Por actualizar"
      : formatearPrecio(total / 100);

  function abrirCarrito() {
    if (!dialogo.current?.open) {
      dialogo.current?.showModal();
    }
  }

  function cerrarCarrito() {
    dialogo.current?.close();
  }

  return (
    <>
      {unidades > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md">
            <Boton
              type="button"
              variante="primario"
              tamano="lg"
              onClick={abrirCarrito}
              aria-haspopup="dialog"
              aria-controls="panel-carrito"
              aria-label={`Ver carrito: ${unidades} unidades, total ${totalFormateado}`}
              className="w-full shadow-xl shadow-black/30"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6 shrink-0"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 3h2l2.4 12h11.2L21 7H6M9 20h.01M18 20h.01"
                    />
                  </svg>

                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-sm font-bold">
                    {unidades}
                  </span>

                  <span>Ver carrito</span>
                </span>

                <span className="shrink-0 font-bold">
                  {totalFormateado}
                </span>
              </span>
            </Boton>
          </div>
        </div>
      )}

      <dialog
        id="panel-carrito"
        ref={dialogo}
        aria-labelledby="carrito-titulo"
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-borde bg-superficie p-0 text-texto shadow-2xl backdrop:bg-black/60 md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-3xl"
      >
        <div className="flex max-h-[calc(85dvh-2px)] flex-col md:h-full md:max-h-none">
          <div className="flex shrink-0 justify-end border-b border-borde px-5 py-3">
            <Boton
              type="button"
              variante="secundario"
              onClick={cerrarCarrito}
            >
              Cerrar
            </Boton>
          </div>

          <div className="min-h-[25dvh] flex-1 overflow-y-auto overscroll-contain md:min-h-0">
            <fieldset
              disabled={props.enviando}
              className="p-5 disabled:opacity-60"
            >
              <legend className="sr-only">
                Productos del carrito
              </legend>

              <Carrito {...props} enPanel />
            </fieldset>
          </div>

          <footer className="max-h-[min(50dvh,calc(60dvh-5rem))] shrink-0 space-y-4 overflow-y-auto overscroll-contain border-t border-borde bg-superficie px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-h-none md:overflow-visible">
            <p className="text-sm text-texto-suave">
              {unidades} {unidades === 1 ? "unidad" : "unidades"}
              {" · "}
              {props.items.length}{" "}
              {props.items.length === 1 ? "producto" : "productos"}
            </p>

            <div
              aria-live="polite"
              aria-atomic="true"
              className="flex items-center justify-between gap-3"
            >
              <span className="text-lg font-semibold">
                Total
              </span>

              <span className="text-xl font-bold">
                {totalFormateado}
              </span>
            </div>

            {props.opciones && (
              <fieldset
                disabled={props.enviando}
                className="disabled:opacity-60"
              >
                {props.opciones}
              </fieldset>
            )}

            {props.faltaDato && unidades > 0 && (
              <p className="text-sm text-aviso-texto">
                {props.faltaDato}
              </p>
            )}

            {!props.pedidosHabilitados && (
              <MensajeEstado
                tipo="vacio"
                titulo="Pide al mesero que habilite la mesa"
              />
            )}

            {props.resultado && (
              props.resultado.ok ? (
                <Tarjeta role="status">
                  <Insignia tono="exito">
                    Pedido confirmado
                  </Insignia>

                  <p className="mt-3 font-semibold">
                    Tu número de pedido es {props.resultado.numero}
                  </p>
                </Tarjeta>
              ) : (
                <Tarjeta role="alert">
                  <p className="text-sm font-semibold text-peligro-texto">
                    {props.resultado.mensaje}
                  </p>

                  {props.resultado.problemas && (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-texto">
                      {props.resultado.problemas.map(
                        (problema, indice) => {
                          // El servidor incluye el ID incluso
                          // si el producto ya no existe.
                          const id =
                            "productoId" in problema &&
                            typeof problema.productoId === "string"
                              ? problema.productoId
                              : undefined;

                          const nombre =
                            problema.nombre ??
                            props.productos.find(
                              (producto) => producto.id === id,
                            )?.name ??
                            (id
                              ? `Producto ${id}`
                              : "Producto solicitado");

                          const mensajes: Record<string, string> = {
                            PRECIO_CAMBIO:
                              problema.precioActualCentimos === undefined
                                ? "El precio cambió. Actualiza la carta antes de confirmar."
                                : `El precio cambió a ${formatearPrecio(
                                    problema.precioActualCentimos / 100,
                                  )}. Actualiza la carta antes de confirmar.`,
                            AGOTADO:
                              "Está agotado. Elimínalo del carrito para continuar.",
                            INACTIVO:
                              "Ya no está activo en la carta. Elimínalo del carrito.",
                            NO_EXISTE:
                              "Ya no existe en la carta. Elimínalo del carrito.",
                          };

                          return (
                            <li key={`${id ?? nombre}-${indice}`}>
                              <strong>{nombre}:</strong>{" "}
                              {mensajes[problema.motivo] ??
                                problema.motivo}
                            </li>
                          );
                        },
                      )}
                    </ul>
                  )}
                </Tarjeta>
              )
            )}

            <Boton
              type="button"
              variante="primario"
              tamano="lg"
              onClick={props.onConfirmar}
              disabled={
                props.enviando ||
                !props.pedidosHabilitados ||
                unidades === 0 ||
                hayProductosAusentes ||
                Boolean(props.faltaDato)
              }
              className="w-full"
            >
              {props.enviando
                ? "Confirmando pedido..."
                : "Confirmar pedido"}
            </Boton>

            <Boton
              type="button"
              variante="secundario"
              tamano="lg"
              onClick={cerrarCarrito}
              className="w-full"
            >
              Seguir viendo la carta
            </Boton>
          </footer>
        </div>
      </dialog>
    </>
  );
}
