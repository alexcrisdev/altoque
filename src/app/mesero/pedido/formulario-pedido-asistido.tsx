"use client";

import { useMemo, useRef, useState } from "react";
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
import { LIMITES, type ItemCarrito } from "@/features/pedidos/tipos";

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

export function FormularioPedidoAsistido({ categorias, mesas, locales }: Props) {
  const productos = useMemo(() => categorias.flatMap((c) => c.productos), [categorias]);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const [modalidad, setModalidad] = useState<Modalidad>(mesas.length ? "DINE_IN" : "TAKEAWAY");
  const [mesaId, setMesaId] = useState(mesas[0]?.id ?? "");
  const [localId, setLocalId] = useState(locales[0]?.id ?? "");
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRegistroPedido | null>(null);

  // Misma clave en los reintentos = mismo pedido. Se renueva si cambia el pedido.
  const clave = useRef<string | null>(null);
  // Bloqueo inmediato del doble clic, antes de que React vuelva a dibujar.
  const envioEnCurso = useRef(false);

  function cambiar(accion: () => void) {
    if (envioEnCurso.current) return;
    accion();
    clave.current = null;
    setResultado(null);
  }

  const total = calcularTotalCentimos(items, productos);
  const destinoListo = modalidad === "DINE_IN" ? mesaId !== "" : localId !== "";

  async function registrar() {
    if (envioEnCurso.current || items.length === 0 || !destinoListo) return;
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
        mensaje: "No se pudo registrar el pedido. Revisa tu conexión e inténtalo otra vez.",
      });
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 grid gap-8">
      <fieldset disabled={enviando} className="grid gap-3 rounded-xl border p-4">
        <legend className="px-1 font-semibold">¿Dónde consume el cliente?</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modalidad"
              checked={modalidad === "DINE_IN"}
              onChange={() => cambiar(() => setModalidad("DINE_IN"))}
            />
            En el local (mesa)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modalidad"
              checked={modalidad === "TAKEAWAY"}
              onChange={() => cambiar(() => setModalidad("TAKEAWAY"))}
            />
            Para llevar
          </label>
        </div>

        {modalidad === "DINE_IN" ? (
          mesas.length ? (
            <label className="grid gap-1">
              Mesa
              <select
                value={mesaId}
                onChange={(e) => cambiar(() => setMesaId(e.target.value))}
                className="rounded border p-2"
              >
                {mesas.map((mesa) => (
                  <option key={mesa.id} value={mesa.id}>
                    Mesa {mesa.numero}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-amber-800">
              No hay mesas con sesión abierta. Abre la mesa desde el panel antes de registrar.
            </p>
          )
        ) : (
          <label className="grid gap-1">
            Local
            <select
              value={localId}
              onChange={(e) => cambiar(() => setLocalId(e.target.value))}
              className="rounded border p-2"
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
        <h2 id="titulo-carta" className="text-xl font-semibold">
          Carta
        </h2>
        {categorias.length === 0 && <p className="mt-2">Este restaurante aún no tiene productos.</p>}
        {categorias.map((categoria) => (
          <div key={categoria.id} className="mt-4">
            <h3 className="font-semibold text-zinc-700">{categoria.name}</h3>
            <ul className="mt-2 grid gap-2">
              {categoria.productos.map((producto) => (
                <li key={producto.id} className="flex items-center justify-between gap-3 rounded border p-3">
                  <span>
                    {producto.name}{" "}
                    <span className="text-sm text-zinc-600">{formatearPrecio(producto.price)}</span>
                  </span>
                  <button
                    type="button"
                    disabled={!producto.available || enviando}
                    onClick={() => cambiar(() => setItems((actuales) => agregarAlCarrito(actuales, producto)))}
                    className="min-h-10 rounded border px-3 py-1 disabled:opacity-50"
                  >
                    {producto.available ? "Agregar" : "Agotado"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="titulo-pedido" className="rounded-xl border p-4">
        <h2 id="titulo-pedido" className="text-xl font-semibold">
          Pedido
        </h2>
        {items.length === 0 ? (
          <p className="mt-2 text-zinc-600">Agrega productos de la carta.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {items.map((item) => {
              const producto = porId.get(item.productoId);
              if (!producto) return null;
              return (
                <li key={item.productoId} className="flex flex-wrap items-center justify-between gap-3">
                  <span>{producto.name}</span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Quitar una unidad de ${producto.name}`}
                      disabled={enviando || item.cantidad <= LIMITES.cantidadMin}
                      onClick={() => cambiar(() => setItems((a) => cambiarCantidad(a, producto, item.cantidad - 1)))}
                      className="h-9 w-9 rounded border disabled:opacity-50"
                    >
                      −
                    </button>
                    <span aria-live="polite" className="w-6 text-center">
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label={`Agregar una unidad de ${producto.name}`}
                      disabled={enviando || item.cantidad >= LIMITES.cantidadMax}
                      onClick={() => cambiar(() => setItems((a) => cambiarCantidad(a, producto, item.cantidad + 1)))}
                      className="h-9 w-9 rounded border disabled:opacity-50"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => cambiar(() => setItems((a) => quitarDelCarrito(a, item.productoId)))}
                      className="text-sm underline"
                    >
                      Quitar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-lg font-semibold">Total: {formatearPrecio(total / 100)}</p>

        {resultado &&
          (resultado.ok ? (
            <p role="status" className="mt-3 font-semibold text-teal-700">
              Pedido N.º {resultado.numero} registrado por el mesero.
            </p>
          ) : (
            <div role="alert" className="mt-3 rounded-lg border border-amber-400 p-3 text-sm">
              <p>{resultado.mensaje}</p>
              {resultado.problemas && (
                <ul className="mt-1 list-disc pl-5">
                  {resultado.problemas.map((problema, i) => (
                    <li key={i}>
                      {problema.nombre ?? "Un producto"} {MOTIVOS[problema.motivo] ?? problema.motivo}.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

        <button
          type="button"
          onClick={registrar}
          disabled={enviando || items.length === 0 || !destinoListo}
          className="mt-4 min-h-12 w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? "Registrando…" : "Registrar pedido"}
        </button>
      </section>
    </div>
  );
}
