"use client";

import { useMemo, useRef, useState } from "react";
import {
  Boton,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import type { CategoriaConProductos } from "@/features/carta/tipos";
import { registrarPedidoAsistidoAction } from "@/features/mesero/actions";
import type { ResultadoRegistroPedido } from "@/features/pedidos/actions";
import {
  agregarAlCarrito,
  aItemsPedido,
  calcularTotalCentimos,
  cambiarCantidad,
  quitarDelCarrito,
} from "@/features/pedidos/carrito-logica";
import {
  LIMITES,
  type ItemCarrito,
} from "@/features/pedidos/tipos";

type Props = {
  categorias: CategoriaConProductos[];
  mesas: { id: string; numero: number }[];
  locales: { id: string; nombre: string }[];
};

type Modalidad = "DINE_IN" | "TAKEAWAY";

const MOTIVOS: Record<string, string> = {
  AGOTADO: "está agotado",
  INACTIVO: "ya no está en la carta",
  NO_EXISTE: "ya no existe",
  PRECIO_CAMBIO: "cambió de precio; actualiza la página",
};

export function FormularioPedidoAsistido({
  categorias,
  mesas,
  locales,
}: Props) {
  const productos = useMemo(
    () => categorias.flatMap((c) => c.productos),
    [categorias],
  );

  const porId = useMemo(
    () => new Map(productos.map((p) => [p.id, p])),
    [productos],
  );

  const [modalidad, setModalidad] = useState<Modalidad>(
    mesas.length ? "DINE_IN" : "TAKEAWAY",
  );
  const [mesaId, setMesaId] = useState(mesas[0]?.id ?? "");
  const [localId, setLocalId] = useState(locales[0]?.id ?? "");
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] =
    useState<ResultadoRegistroPedido | null>(null);

  // Misma clave en los reintentos = mismo pedido.
  // Se renueva si cambia el pedido.
  const clave = useRef<string | null>(null);

  // Bloqueo inmediato del doble clic,
  // antes de que React vuelva a dibujar.
  const envioEnCurso = useRef(false);

  function cambiar(accion: () => void) {
    if (envioEnCurso.current) return;

    accion();
    clave.current = null;
    setResultado(null);
  }

  const total = calcularTotalCentimos(items, productos);

  const destinoListo =
    modalidad === "DINE_IN"
      ? mesaId !== ""
      : localId !== "";

  async function registrar() {
    if (
      envioEnCurso.current ||
      items.length === 0 ||
      !destinoListo
    ) {
      return;
    }

    envioEnCurso.current = true;
    setEnviando(true);
    setResultado(null);

    try {
      clave.current ??= crypto.randomUUID();

      const solicitud =
        modalidad === "DINE_IN"
          ? { modalidad, mesaId, localId: null }
          : { modalidad, mesaId: null, localId };

      const respuesta = await registrarPedidoAsistidoAction(
        clave.current,
        solicitud,
        aItemsPedido(items, productos),
      );

      setResultado(respuesta);

      if (respuesta.ok) {
        setItems([]);
        clave.current = null;
      }
    } catch {
      setResultado({
        ok: false,
        mensaje:
          "No se pudo registrar el pedido. Revisa tu conexión e inténtalo otra vez.",
      });
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 grid gap-8">
      <fieldset
        disabled={enviando}
        className="grid gap-4 rounded-2xl border border-borde bg-superficie p-5 text-texto disabled:opacity-60"
      >
        <legend className="px-1 font-semibold">
          ¿Dónde consume el cliente?
        </legend>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-borde px-3 py-2 text-sm has-checked:border-marca has-checked:bg-superficie-suave has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca">
            <input
              type="radio"
              name="modalidad"
              checked={modalidad === "DINE_IN"}
              onChange={() =>
                cambiar(() => setModalidad("DINE_IN"))
              }
              className="h-4 w-4 accent-marca"
            />
            En el local (mesa)
          </label>

          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-borde px-3 py-2 text-sm has-checked:border-marca has-checked:bg-superficie-suave has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca">
            <input
              type="radio"
              name="modalidad"
              checked={modalidad === "TAKEAWAY"}
              onChange={() =>
                cambiar(() => setModalidad("TAKEAWAY"))
              }
              className="h-4 w-4 accent-marca"
            />
            Para llevar
          </label>
        </div>

        {modalidad === "DINE_IN" ? (
          mesas.length ? (
            <label className="grid gap-2 text-sm font-medium">
              Mesa

              <select
                value={mesaId}
                onChange={(event) =>
                  cambiar(() => setMesaId(event.target.value))
                }
                className="min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                {mesas.map((mesa) => (
                  <option key={mesa.id} value={mesa.id}>
                    Mesa {mesa.numero}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <MensajeEstado
              tipo="vacio"
              titulo="No hay mesas con sesión abierta."
              descripcion="Abre la mesa desde el panel antes de registrar."
            />
          )
        ) : (
          <label className="grid gap-2 text-sm font-medium">
            Local

            <select
              value={localId}
              onChange={(event) =>
                cambiar(() => setLocalId(event.target.value))
              }
              className="min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              {locales.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <section aria-labelledby="titulo-carta">
        <h2
          id="titulo-carta"
          className="mb-4 text-xl font-semibold text-texto"
        >
          Carta
        </h2>

        {categorias.length === 0 && (
          <MensajeEstado
            tipo="vacio"
            titulo="Este restaurante aún no tiene productos."
          />
        )}

        {categorias.map((categoria) => (
          <div key={categoria.id} className="mt-4">
            <h3 className="font-semibold text-texto">
              {categoria.name}
            </h3>

            <ul className="mt-3 grid gap-3">
              {categoria.productos.map((producto) => (
                <li key={producto.id}>
                  <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {producto.name}
                      </p>

                      <p className="mt-1 text-sm text-texto-suave">
                        {formatearPrecio(producto.price)}
                      </p>
                    </div>

                    <Boton
                      type="button"
                      variante="secundario"
                      disabled={!producto.available || enviando}
                      onClick={() =>
                        cambiar(() =>
                          setItems((actuales) =>
                            agregarAlCarrito(actuales, producto),
                          ),
                        )
                      }
                    >
                      {producto.available ? "Agregar" : "Agotado"}
                    </Boton>
                  </Tarjeta>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="titulo-pedido">
        <Tarjeta>
          <h2
            id="titulo-pedido"
            className="text-xl font-semibold"
          >
            Pedido
          </h2>

          {items.length === 0 ? (
            <div className="mt-4">
              <MensajeEstado
                tipo="vacio"
                titulo="Agrega productos de la carta."
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-4">
              {items.map((item) => {
                const producto = porId.get(item.productoId);

                if (!producto) return null;

                return (
                  <li
                    key={item.productoId}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-borde pb-4"
                  >
                    <span className="break-words font-medium">
                      {producto.name}
                    </span>

                    <span className="flex flex-wrap items-center gap-2">
                      <Boton
                        type="button"
                        variante="secundario"
                        aria-label={`Quitar una unidad de ${producto.name}`}
                        disabled={
                          enviando ||
                          item.cantidad <= LIMITES.cantidadMin
                        }
                        onClick={() =>
                          cambiar(() =>
                            setItems((actuales) =>
                              cambiarCantidad(
                                actuales,
                                producto,
                                item.cantidad - 1,
                              ),
                            ),
                          )
                        }
                        className="min-w-11"
                      >
                        −
                      </Boton>

                      <span
                        aria-live="polite"
                        className="w-6 text-center font-semibold"
                      >
                        {item.cantidad}
                      </span>

                      <Boton
                        type="button"
                        variante="secundario"
                        aria-label={`Agregar una unidad de ${producto.name}`}
                        disabled={
                          enviando ||
                          item.cantidad >= LIMITES.cantidadMax
                        }
                        onClick={() =>
                          cambiar(() =>
                            setItems((actuales) =>
                              cambiarCantidad(
                                actuales,
                                producto,
                                item.cantidad + 1,
                              ),
                            ),
                          )
                        }
                        className="min-w-11"
                      >
                        +
                      </Boton>

                      <Boton
                        type="button"
                        variante="peligro"
                        disabled={enviando}
                        onClick={() =>
                          cambiar(() =>
                            setItems((actuales) =>
                              quitarDelCarrito(
                                actuales,
                                item.productoId,
                              ),
                            ),
                          )
                        }
                      >
                        Quitar
                      </Boton>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-lg font-semibold">
            Total: {formatearPrecio(total / 100)}
          </p>

          {resultado &&
            (resultado.ok ? (
              <div role="status" className="mt-4 space-y-2">
                <Insignia tono="exito">
                  Pedido registrado
                </Insignia>

                <p className="font-semibold">
                  Pedido N.º {resultado.numero} registrado por
                  el mesero.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <Tarjeta role="alert">
                  <p className="text-sm font-semibold text-peligro-texto">
                    {resultado.mensaje}
                  </p>

                  {resultado.problemas && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {resultado.problemas.map((problema, i) => (
                        <li key={i}>
                          {problema.nombre ?? "Un producto"}{" "}
                          {MOTIVOS[problema.motivo] ??
                            problema.motivo}
                          .
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </div>
            ))}

          <Boton
            type="button"
            variante="primario"
            tamano="lg"
            onClick={registrar}
            disabled={
              enviando ||
              items.length === 0 ||
              !destinoListo
            }
            className="mt-4 w-full"
          >
            {enviando ? "Registrando…" : "Registrar pedido"}
          </Boton>
        </Tarjeta>
      </section>
    </div>
  );
}
