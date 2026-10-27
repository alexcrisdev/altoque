"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
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
          <button
            type="button"
            onClick={abrirCarrito}
            aria-haspopup="dialog"
            aria-controls="panel-carrito"
            aria-label={`Ver carrito: ${unidades} unidades, total ${totalFormateado}`}
            className="mx-auto flex min-h-16 w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-teal-700 px-5 py-4 text-white shadow-xl shadow-black/30 transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-500"
          >
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

              <span className="font-semibold">Ver carrito</span>
            </span>

            <span className="shrink-0 font-bold">
              {totalFormateado}
            </span>
          </button>
        </div>
      )}

      <dialog
        id="panel-carrito"
        ref={dialogo}
        aria-labelledby="carrito-titulo"
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-gray-300 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-3xl"
      >
        <div className="flex max-h-[85dvh] flex-col md:h-full md:max-h-none">
          <div className="flex shrink-0 justify-end border-b border-gray-300 px-5 py-3">
            <button
              type="button"
              onClick={cerrarCarrito}
              className="min-h-11 rounded-lg border border-gray-400 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              Cerrar
            </button>
          </div>

          <fieldset disabled={props.enviando} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 disabled:opacity-60">
            <legend className="sr-only">Productos del carrito</legend>
            <Carrito {...props} enPanel />
          </fieldset>

          <footer className="shrink-0 space-y-4 border-t border-gray-300 bg-background px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <p className="text-sm">{unidades} {unidades === 1 ? "unidad" : "unidades"} · {props.items.length} {props.items.length === 1 ? "producto" : "productos"}</p>
            <div
              aria-live="polite"
              aria-atomic="true"
              className="flex items-center justify-between gap-3"
            >
              <span className="text-lg font-semibold">Total</span>
              <span className="text-xl font-bold">
                {totalFormateado}
              </span>
            </div>

            {props.opciones && (
              <fieldset disabled={props.enviando} className="disabled:opacity-60">
                {props.opciones}
              </fieldset>
            )}

            {props.faltaDato && unidades > 0 && (
              <p className="text-sm text-amber-800">{props.faltaDato}</p>
            )}

            {!props.pedidosHabilitados && (
              <p role="status">Pide al mesero que habilite la mesa</p>
            )}

            {props.resultado && (
              props.resultado.ok ? (
                <p role="status" className="font-semibold text-teal-700">
                  Tu número de pedido es {props.resultado.numero}
                </p>
              ) : (
                <div role="alert" className="space-y-2 rounded-lg border border-amber-400 p-3 text-sm">
                  <p>{props.resultado.mensaje}</p>
                  {props.resultado.problemas && (
                    <ul className="list-disc space-y-1 pl-5">
                      {props.resultado.problemas.map((problema, indice) => {
                        // La validación del servidor incluye el ID incluso si ya no existe el producto.
                        const id = "productoId" in problema && typeof problema.productoId === "string"
                          ? problema.productoId : undefined;
                        const nombre = problema.nombre
                          ?? props.productos.find((producto) => producto.id === id)?.name
                          ?? (id ? `Producto ${id}` : "Producto solicitado");
                        const mensajes: Record<string, string> = {
                          PRECIO_CAMBIO: problema.precioActualCentimos === undefined
                            ? "El precio cambió. Actualiza la carta antes de confirmar."
                            : `El precio cambió a ${formatearPrecio(problema.precioActualCentimos / 100)}. Actualiza la carta antes de confirmar.`,
                          AGOTADO: "Está agotado. Elimínalo del carrito para continuar.",
                          INACTIVO: "Ya no está activo en la carta. Elimínalo del carrito.",
                          NO_EXISTE: "Ya no existe en la carta. Elimínalo del carrito.",
                        };
                        return <li key={`${id ?? nombre}-${indice}`}><strong>{nombre}:</strong> {mensajes[problema.motivo] ?? problema.motivo}</li>;
                      })}
                    </ul>
                  )}
                </div>
              )
            )}

            <button
              type="button"
              onClick={props.onConfirmar}
              disabled={props.enviando || !props.pedidosHabilitados || unidades === 0 || hayProductosAusentes || Boolean(props.faltaDato)}
              className="min-h-12 w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.enviando ? "Confirmando pedido..." : "Confirmar pedido"}
            </button>

            <button
              type="button"
              onClick={cerrarCarrito}
              className="min-h-12 w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              Seguir viendo la carta
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
