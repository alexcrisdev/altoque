"use client";

import { ImagenProducto } from "../../components/imagen-producto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boton,
  BotonEnlace,
  Insignia,
  Tarjeta,
  clasesBoton,
} from "../../components/ui";
import { formatearPrecio } from "./formato";
import { DetalleProducto } from "./detalle-producto";
import { PanelCarrito } from "../pedidos/panel-carrito";
import { ALERGIA_INICIAL, validarAlergia, type AlergiaFormulario } from "../pedidos/alergias";
import {
  registrarPedidoQrAction,
  type ResultadoRegistroPedido,
} from "../pedidos/actions";
import {
  datosFaltantes,
  type ConfigParaLlevar,
  type Modalidad,
} from "../pedidos/modalidad";
import {
  agregarPedidoGuardado,
  type PedidoGuardado,
} from "../pedidos/estado-cliente";
import { SelectorModalidad } from "../pedidos/selector-modalidad";
import {
  agregarAlCarrito,
  aItemsPedido,
  ajustarADisponible,
  aplicarDisponibilidad,
  cambiarCantidad as actualizarCantidad,
  estaAgotado,
  hayLineasConProblema,
  POCAS_UNIDADES,
  quitarDelCarrito,
  cambiarObservacion as actualizarObservacion,
} from "../pedidos/carrito-logica";
import { LIMITES, type ItemCarrito } from "../pedidos/tipos";
import { IconoCandado } from "../../components/icono-candado";
import { consultarDisponibilidadAction } from "./disponibilidad-actions";
import type {
  CategoriaConProductos,
  DisponibilidadProducto,
  Producto,
} from "./tipos";

// US-103: cada cuánto la carta vuelve a mirar el stock (criterio: 10–15 s).
const SEGUNDOS_STOCK = 12;

// US-002: de dónde viene el cliente y qué datos pide el restaurante para llevar.
export type DatosPedidoCliente = {
  modalidadQr: Modalidad;
  mesaNumero: number | null;
  paraLlevar: ConfigParaLlevar;
};

type Props = {
  categorias: CategoriaConProductos[];
  token: string;
  pedidosHabilitados: boolean;
  pedido: DatosPedidoCliente;
  observacionesHabilitadas?: boolean;
};

export function CartaInteractiva({
  categorias,
  token,
  pedidosHabilitados,
  pedido,
  observacionesHabilitadas = false,
}: Props) {
  const [seleccionado, setSeleccionado] = useState<Producto | null>(
    null,
  );
  const dialogo = useRef<HTMLDialogElement>(null);

  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] =
    useState<ResultadoRegistroPedido | null>(null);

  // US-037: conserva la clave del pedido confirmado para abrir su estado.
  const [claveConfirmada, setClaveConfirmada] =
    useState<string | null>(null);

  const clavePedido = useRef<string | null>(null);

  // El bloqueo es inmediato, incluso antes del siguiente render de React.
  const envioEnCurso = useRef(false);

  const [modalidad, setModalidad] = useState<Modalidad>(
    pedido.modalidadQr,
  );
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [alergia, setAlergia] = useState<AlergiaFormulario>(ALERGIA_INICIAL);

  const faltaDato = datosFaltantes(
    modalidad,
    nombre,
    telefono,
    pedido.paraLlevar,
  );

  const [aviso, setAviso] = useState("");
  const itemsAnteriores = useRef<ItemCarrito[]>([]);

  // US-103: última foto del stock que devolvió el servidor.
  const [disponibilidad, setDisponibilidad] = useState<
    ReadonlyMap<string, DisponibilidadProducto>
  >(new Map());
  const consultandoStock = useRef(false);

  const categoriasVivas = useMemo(
    () =>
      categorias.map((categoria) => ({
        ...categoria,
        productos: aplicarDisponibilidad(categoria.productos, disponibilidad),
      })),
    [categorias, disponibilidad],
  );

  const productos = useMemo(
    () => categoriasVivas.flatMap((categoria) => categoria.productos),
    [categoriasVivas],
  );

  const consultarStock = useCallback(async () => {
    if (consultandoStock.current) return;
    consultandoStock.current = true;
    try {
      const respuesta = await consultarDisponibilidadAction(token);
      if (respuesta.ok) {
        setDisponibilidad(
          new Map(respuesta.productos.map((producto) => [producto.id, producto])),
        );
      }
    } catch {
      // Sin red: se reintenta en la siguiente vuelta.
    } finally {
      consultandoStock.current = false;
    }
  }, [token]);

  useEffect(() => {
    function siVisible() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void consultarStock();
      }
    }
    const intervalo = window.setInterval(siVisible, SEGUNDOS_STOCK * 1000);
    document.addEventListener("visibilitychange", siVisible);
    window.addEventListener("online", siVisible);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", siVisible);
      window.removeEventListener("online", siVisible);
    };
  }, [consultarStock]);

  const productoSeleccionado = seleccionado
    ? productos.find((producto) => producto.id === seleccionado.id) ?? seleccionado
    : null;

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
    actualizarCarrito((actuales) =>
      agregarAlCarrito(actuales, producto),
    );
  }

  function actualizarCarrito(
    cambiar: (actuales: ItemCarrito[]) => ItemCarrito[],
  ) {
    if (envioEnCurso.current) return;

    const nuevos = cambiar(items);

    if (JSON.stringify(nuevos) === JSON.stringify(items)) return;

    clavePedido.current = null;
    setResultado(null);
    setItems(nuevos);
  }

  // Cambiar la modalidad o los datos es otro pedido: nueva clave.
  function cambiarOpciones(cambiar: () => void) {
    if (envioEnCurso.current) return;

    cambiar();
    clavePedido.current = null;
    setResultado(null);
  }

  async function confirmar() {
    if (
      envioEnCurso.current ||
      !pedidosHabilitados ||
      items.length === 0 ||
      hayLineasConProblema(items, productos) ||
      faltaDato || !validarAlergia(alergia).ok
    ) {
      return;
    }

    envioEnCurso.current = true;
    setEnviando(true);
    setResultado(null);

    try {
      const entrada = aItemsPedido(items, productos);
      clavePedido.current ??= crypto.randomUUID();

      // Conservamos la misma clave utilizada al registrar el pedido.
      const clave = clavePedido.current;

      const respuesta = await registrarPedidoQrAction(
        token,
        clave,
        entrada,
        {
          modalidad,
          nombre,
          telefono,
        },
        alergia,
      );

      setResultado(respuesta);

      if (respuesta.ok) {
        setClaveConfirmada(clave);

        const ahora = Date.now();

        const nuevo: PedidoGuardado = {
          clave,
          numero: respuesta.numero,
          creadoEn: new Date(ahora).toISOString(),
        };

        const almacenamiento = `altoque:pedidos:${token}`;
        let anteriores: unknown = [];

        try {
          anteriores = JSON.parse(
            window.localStorage.getItem(almacenamiento) ?? "[]",
          );
        } catch {
          // Si falla la lectura, el enlace sigue disponible en pantalla.
        }

        try {
          const guardados = agregarPedidoGuardado(
            Array.isArray(anteriores) ? anteriores : [],
            nuevo,
            ahora,
          );

          window.localStorage.setItem(
            almacenamiento,
            JSON.stringify(guardados),
          );

          // Actualiza "Mis pedidos" dentro de esta misma pestaña.
          window.dispatchEvent(
            new Event("altoque:pedidos-actualizados"),
          );
        } catch {
          // El pedido sigue confirmado aunque no se pueda guardar aquí.
        }

        setItems([]);
        setAlergia(ALERGIA_INICIAL);
        setAviso("");
        clavePedido.current = null;
      }
    } catch (error) {
      setResultado({
        ok: false,
        mensaje:
          error instanceof Error &&
          (error.message.includes("ya no está en la carta") || error.message.startsWith("Ya no hay"))
            ? error.message
            : "No se pudo confirmar el pedido. Revisa tu conexión e inténtalo otra vez.",
      });
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
      // US-103: si se agotó en el mismo segundo, el stock nuevo marca solo esa línea.
      void consultarStock();
    }
  }

  function dejarDisponible(productoId: string) {
    const producto = productos.find((producto) => producto.id === productoId);
    if (!producto) return;
    actualizarCarrito((actuales) => ajustarADisponible(actuales, producto));
  }

  function cambiarCantidad(
    productoId: string,
    cantidad: number,
  ) {
    const producto = productos.find(
      (producto) => producto.id === productoId,
    );

    if (!producto) return;

    actualizarCarrito((actuales) =>
      actualizarCantidad(actuales, producto, cantidad),
    );
  }

  function eliminarProducto(productoId: string) {
    actualizarCarrito((actuales) =>
      quitarDelCarrito(actuales, productoId),
    );

    setAviso("");
  }

  function cambiarObservacion(
    productoId: string,
    observacion: string,
  ) {
    actualizarCarrito((actuales) =>
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
        className="carta-categorias sticky top-0 z-20 -mx-4 mb-8 flex gap-2 overflow-x-auto border-y border-borde bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        {categorias.map((categoria) => (
          <a
            key={categoria.id}
            href={`#categoria-${categoria.id}`}
            className={`${clasesBoton("secundario", "md")} shrink-0`}
          >
            {categoria.name}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {categoriasVivas.map((categoria) => (
          <section
            key={categoria.id}
            id={`categoria-${categoria.id}`}
            aria-labelledby={`titulo-${categoria.id}`}
            className="scroll-mt-24"
          >
            <h2
              id={`titulo-${categoria.id}`}
              className="mb-4 border-l-4 border-acento pl-3 text-2xl font-bold tracking-tight text-texto"
            >
              {categoria.name}
            </h2>

            <ul className="grid gap-3 md:grid-cols-2">
              {categoria.productos.map((producto) => {
                const agotado = estaAgotado(producto);
                const enCarrito =
                  items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;
                const sinMas =
                  agotado ||
                  enCarrito >= LIMITES.cantidadMax ||
                  (typeof producto.quedan === "number" && enCarrito >= producto.quedan);
                const pocas =
                  !agotado &&
                  typeof producto.quedan === "number" &&
                  producto.quedan <= POCAS_UNIDADES;

                return (
                <li key={producto.id} className="relative">
                  <Boton
                    type="button"
                    variante="secundario"
                    tamano="lg"
                    onClick={() => abrirDetalle(producto)}
                    aria-haspopup="dialog"
                    className={`carta-producto h-full w-full gap-3 pr-16 text-left sm:gap-4 ${
                      agotado ? "opacity-60 grayscale" : ""
                    }`}
                  >
                      <ImagenProducto
                        src={producto.image_url}
                        nombre={producto.name}
                        decorativa
                        className="h-24 w-24 shrink-0 rounded-xl sm:h-32 sm:w-32"
                      />

                    <span className="min-w-0 flex-1 space-y-2 text-left">
                      <span className="block break-words font-semibold">
                        {producto.name}
                      </span>

                      {producto.description && (
                        <span className="block break-words text-sm font-normal text-texto-suave">
                          {producto.description}
                        </span>
                      )}

                      <span className="block text-lg font-bold tabular-nums text-marca">
                        {formatearPrecio(producto.price)}
                      </span>

                      {agotado && (
                        <Insignia tono="neutro" className="gap-1">
                          <IconoCandado />
                          Agotado
                        </Insignia>
                      )}

                      {pocas && (
                        <Insignia tono="aviso">
                          ¡Quedan {producto.quedan}!
                        </Insignia>
                      )}
                    </span>
                  </Boton>

                  {/* US-103: agregar rápido; se bloquea si está agotado o no queda más. */}
                  <Boton
                    type="button"
                    variante="primario"
                    aria-label={`Agregar ${producto.name} al carrito`}
                    disabled={!pedidosHabilitados || sinMas}
                    onClick={() => agregarProducto(producto)}
                    className="absolute right-3 top-3 min-w-11 px-0 text-xl"
                  >
                    {agotado ? <IconoCandado className="h-5 w-5" /> : "+"}
                  </Boton>
                </li>
                );
              })}
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
        onDejarDisponible={dejarDisponible}
        onCambiarObservacion={cambiarObservacion}
        pedidosHabilitados={pedidosHabilitados}
        enviando={enviando}
        resultado={resultado}
        seguimientoHref={claveConfirmada
          ? `/m/${encodeURIComponent(token)}/pedido/${encodeURIComponent(claveConfirmada)}`
          : null}
        onConfirmar={confirmar}
        alergia={alergia}
        onAlergia={(valor) => cambiarOpciones(() => setAlergia(valor))}
        faltaDato={faltaDato}
        opciones={
          <SelectorModalidad
            modalidadQr={pedido.modalidadQr}
            mesaNumero={pedido.mesaNumero}
            config={pedido.paraLlevar}
            modalidad={modalidad}
            nombre={nombre}
            telefono={telefono}
            onModalidad={(valor) =>
              cambiarOpciones(() => setModalidad(valor))
            }
            onNombre={(valor) =>
              cambiarOpciones(() => setNombre(valor))
            }
            onTelefono={(valor) =>
              cambiarOpciones(() => setTelefono(valor))
            }
          />
        }
      />

      {resultado?.ok && (
        <Tarjeta role="status" className="my-4">
          <Insignia tono="exito">
            Pedido confirmado
          </Insignia>

          <p className="mt-3 font-semibold">
            Tu número de pedido es {resultado.numero}
          </p>

          {claveConfirmada && (
            <BotonEnlace
              href={`/m/${encodeURIComponent(token)}/pedido/${encodeURIComponent(claveConfirmada)}`}
              variante="primario"
              className="mt-4 w-full"
            >
              Ver el estado de mi pedido
            </BotonEnlace>
          )}
        </Tarjeta>
      )}

      <DetalleProducto
        producto={productoSeleccionado}
        dialogoRef={dialogo}
        onAgregar={agregarProducto}
        aviso={aviso}
      />

      <div
        role="status"
        aria-atomic="true"
        className={
          aviso
            ? "pointer-events-none fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-xl border border-borde bg-superficie px-4 py-3 text-sm font-medium text-texto shadow-lg"
            : "sr-only"
        }
      >
        {aviso}
      </div>
    </div>
  );
}
