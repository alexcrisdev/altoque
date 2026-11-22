"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import {
  Boton,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "../../components/ui";
import { Carrito } from "./carrito";
import { calcularTotalCentimos, hayLineasConProblema } from "./carrito-logica";
import { formatearPrecio } from "../carta/formato";
import type { ResultadoRegistroPedido } from "./actions";
import { ALERGENOS, DECLARACION_ALERGIA, validarAlergia, type AlergiaFormulario, type Alergeno } from "./alergias";

type Props = Omit<ComponentProps<typeof Carrito>, "enPanel"> & {
  dialogoRef?: RefObject<HTMLDialogElement | null>;
  pedidosHabilitados: boolean;
  enviando: boolean;
  resultado: ResultadoRegistroPedido | null;
  onConfirmar: () => void;
  alergia: AlergiaFormulario;
  onAlergia: (alergia: AlergiaFormulario) => void;
  // US-002: selector de modalidad y datos para llevar.
  opciones?: ReactNode;
  // Qué dato falta para poder confirmar (null si está completo).
  faltaDato?: string | null;
};

export function PanelCarrito(props: Props) {
  const dialogoInterno = useRef<HTMLDialogElement>(null);
  const dialogo = props.dialogoRef ?? dialogoInterno;
  const validacionAlergia = validarAlergia(props.alergia);

  useEffect(() => {
    const panel = dialogo.current;
    const viewport = window.visualViewport;
    let cuadro = 0;

    function ajustarEspacioVisible() {
      if (!panel) return;
      const alto = viewport?.height ?? window.innerHeight;
      const inicio = viewport?.offsetTop ?? 0;
      panel.style.setProperty("--carrito-alto", `${alto}px`);
      panel.style.setProperty("--carrito-centro", `${inicio + alto / 2}px`);
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const activo = document.activeElement;
        if (panel.open && activo instanceof HTMLElement &&
          panel.contains(activo) && activo.matches("input, textarea, select")) {
          activo.scrollIntoView({ block: "nearest" });
        }
      });
    }

    ajustarEspacioVisible();
    viewport?.addEventListener("resize", ajustarEspacioVisible);
    viewport?.addEventListener("scroll", ajustarEspacioVisible);
    window.addEventListener("resize", ajustarEspacioVisible);
    return () => {
      cancelAnimationFrame(cuadro);
      viewport?.removeEventListener("resize", ajustarEspacioVisible);
      viewport?.removeEventListener("scroll", ajustarEspacioVisible);
      window.removeEventListener("resize", ajustarEspacioVisible);
    };
  }, [dialogo]);

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

  // US-103: agotados o más unidades de las que quedan bloquean el envío.
  const hayProblemasStock = hayLineasConProblema(props.items, props.productos);

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
        className="fixed inset-x-0 top-[var(--carrito-centro,50%)] bottom-auto m-0 mx-auto max-h-[calc(var(--carrito-alto,100dvh)-1rem)] w-[calc(100%-1rem)] max-w-2xl -translate-y-1/2 overflow-hidden rounded-3xl border border-borde bg-superficie p-0 text-texto shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex max-h-[calc(var(--carrito-alto,100dvh)-1rem-2px)] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-borde bg-marca-suave px-5 py-3">
            <p className="font-semibold">Revisa y confirma tu pedido</p>
            <Boton
              type="button"
              variante="secundario"
              onClick={cerrarCarrito}
            >
              Cerrar
            </Boton>
          </div>

          <div data-carrito-contenido className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-py-4">
            <fieldset
              disabled={props.enviando}
              className="p-5 disabled:opacity-60"
            >
              <legend className="sr-only">
                Productos del carrito
              </legend>

              <Carrito {...props} enPanel />
            </fieldset>
          <div className="space-y-5 border-t border-borde px-5 py-5">
            <p className="text-sm text-texto-suave">
              {unidades} {unidades === 1 ? "unidad" : "unidades"}
              {" · "}
              {props.items.length}{" "}
              {props.items.length === 1 ? "producto" : "productos"}
            </p>

            {props.opciones && (
              <fieldset
                disabled={props.enviando}
                className="disabled:opacity-60"
              >
                {props.opciones}
              </fieldset>
            )}

            {hayProblemasStock && unidades > 0 && (
              <p role="status" className="text-sm font-semibold text-aviso-texto">
                Revisa los platos marcados: quítalos o deja lo que queda para enviar.
              </p>
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

            <fieldset disabled={props.enviando} className="space-y-3 rounded-xl border border-borde p-4 disabled:opacity-60">
              <legend className="px-1 font-semibold">¿Alguien tiene alergias?</legend>
              <div className="flex gap-3">
                {([ ["NONE", "No"], ["YES", "Sí"] ] as const).map(([respuesta, etiqueta]) => (
                  <Boton key={respuesta} type="button" variante="secundario"
                    aria-pressed={props.alergia.respuesta === respuesta}
                    className="flex-1 aria-pressed:border-info-borde aria-pressed:bg-info-fondo aria-pressed:text-info-texto"
                    onClick={() => {
                      if (props.alergia.respuesta !== respuesta) {
                        props.onAlergia({ respuesta, alergenos: [], detalle: "", aceptada: false });
                      }
                    }}>
                    {props.alergia.respuesta === respuesta && <span aria-hidden="true">✓</span>}
                    {etiqueta}
                  </Boton>
                ))}
              </div>
              {props.alergia.respuesta === "YES" && <div className="space-y-3 rounded-lg bg-peligro-fondo p-3 text-peligro-texto">
                <p className="font-semibold">⚠ Indica la alergia para avisar a cocina.</p>
                <div className="grid gap-2">
                  {(Object.entries(ALERGENOS) as [Alergeno, string][]).map(([codigo, etiqueta]) => (
                    <label key={codigo} className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" checked={props.alergia.alergenos.includes(codigo)}
                        onChange={(e) => props.onAlergia({ ...props.alergia, alergenos: e.target.checked
                          ? [...props.alergia.alergenos, codigo] : props.alergia.alergenos.filter(a => a !== codigo) })} />
                      {etiqueta}
                    </label>
                  ))}
                </div>
                <label className="grid gap-2">Detalle (opcional, máx. 120)
                  <textarea maxLength={120} rows={2} value={props.alergia.detalle}
                    className="w-full rounded-lg border border-borde bg-superficie p-3 text-texto"
                    onChange={(e) => props.onAlergia({ ...props.alergia, detalle: e.target.value })} />
                </label>
                <p className="text-sm">Escribe solo información de la alergia, sin nombres, teléfonos ni otros datos personales.</p>
                <label className="flex min-h-11 items-start gap-3">
                  <input type="checkbox" checked={props.alergia.aceptada}
                    onChange={(e) => props.onAlergia({ ...props.alergia, aceptada: e.target.checked })} />
                  <span>{DECLARACION_ALERGIA}</span>
                </label>
              </div>}
              {!validacionAlergia.ok && <p className="text-sm text-texto-suave" aria-live="polite">
                {!validacionAlergia.ok && validacionAlergia.mensaje}
              </p>}
            </fieldset>

            <Boton
              type="button"
              variante="secundario"
              tamano="lg"
              onClick={cerrarCarrito}
              className="w-full"
            >
              Seguir viendo la carta
            </Boton>
          </div>
          </div>

          <footer className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-borde bg-superficie px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div aria-live="polite" aria-atomic="true" className="min-w-0">
              <span className="block text-sm text-texto-suave">Total</span>
              <span className="block font-bold">{totalFormateado}</span>
            </div>
            <Boton
              type="button"
              variante="primario"
              tamano="lg"
              cargando={props.enviando}
              onClick={props.onConfirmar}
              disabled={
                props.enviando ||
                !props.pedidosHabilitados ||
                unidades === 0 ||
                hayProductosAusentes ||
                hayProblemasStock ||
                Boolean(props.faltaDato) || !validacionAlergia.ok
              }
              className="w-full disabled:pointer-events-auto! disabled:cursor-not-allowed aria-busy:cursor-wait"
            >
              {props.enviando
                ? "Confirmando pedido..."
                : "Confirmar pedido"}
            </Boton>

          </footer>
        </div>
      </dialog>
    </>
  );
}
