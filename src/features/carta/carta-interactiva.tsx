"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { registrarPedidoQrAction } from "@/features/pedidos/actions";
import type { ResultadoRegistroPedido } from "@/features/pedidos/actions";
import { formatearPrecio } from "./formato";
import { DetalleProducto } from "./detalle-producto";
import { obtenerEstadoCarrito } from "./estado-carrito";
import type { CategoriaConProductos, Producto } from "./tipos";

type LineaCarrito = { producto: Producto; cantidad: number };

export function CartaInteractiva({ categorias, token, pedidosHabilitados }: { categorias: CategoriaConProductos[]; token: string; pedidosHabilitados: boolean }) {
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRegistroPedido | null>(null);
  const clave = useRef<string | null>(null);
  const envioEnCurso = useRef(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const total = carrito.reduce((suma, linea) => suma + linea.producto.price * linea.cantidad, 0);
  const estadoCarrito = obtenerEstadoCarrito(carrito.length, resultado);

  function abrirDetalle(producto: Producto) {
    setSeleccionado(producto);
    dialogo.current?.showModal();
  }

  function agregar(producto: Producto) {
    clave.current = null;
    setResultado(null);
    setCarrito((actual) => {
      const existente = actual.find((linea) => linea.producto.id === producto.id);
      if (existente) return actual.map((linea) => linea.producto.id === producto.id ? { ...linea, cantidad: Math.min(20, linea.cantidad + 1) } : linea);
      return [...actual, { producto, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productoId: string, cantidad: number) {
    clave.current = null;
    setResultado(null);
    setCarrito((actual) => cantidad < 1 ? actual.filter((linea) => linea.producto.id !== productoId) : actual.map((linea) => linea.producto.id === productoId ? { ...linea, cantidad: Math.min(20, cantidad) } : linea));
  }

  async function confirmar() {
    if (envioEnCurso.current || !carrito.length) return;
    envioEnCurso.current = true;
    setEnviando(true);
    setResultado(null);
    clave.current ??= crypto.randomUUID();
    try {
      const respuesta = await registrarPedidoQrAction(token, clave.current, carrito.map(({ producto, cantidad }) => ({
        productoId: producto.id,
        cantidad,
        observacion: null,
        precioMostradoCentimos: Math.round(producto.price * 100),
      })));
      setResultado(respuesta);
      if (respuesta.ok) {
        setCarrito([]);
        clave.current = null;
      }
    } catch {
      setResultado({ ok: false, mensaje: "No se pudo registrar el pedido. Revisa tu conexión e inténtalo otra vez." });
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="pt-4">
      <nav aria-label="Categorías de la carta" className="sticky top-0 z-10 -mx-1 mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 bg-background px-1 py-3">
        {categorias.map((categoria) => <a key={categoria.id} href={`#categoria-${categoria.id}`} className="shrink-0 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{categoria.name}</a>)}
      </nav>
      <div className="space-y-8">
        {categorias.map((categoria) => <section key={categoria.id} id={`categoria-${categoria.id}`} aria-labelledby={`titulo-${categoria.id}`} className="scroll-mt-24">
          <h2 id={`titulo-${categoria.id}`} className="mb-3 text-xl font-bold">{categoria.name}</h2>
          <ul className="grid gap-3">{categoria.productos.map((producto) => <li key={producto.id}>
            <button type="button" onClick={() => abrirDetalle(producto)} aria-haspopup="dialog" className="flex w-full gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
              {producto.image_url && <Image src={producto.image_url} alt={producto.name} width={88} height={88} unoptimized className="h-22 w-22 shrink-0 rounded-lg object-cover" />}
              <span className="min-w-0 flex-1 space-y-2"><span className="block break-words font-semibold">{producto.name}</span>{producto.description && <span className="block break-words text-sm opacity-80">{producto.description}</span>}<span className="block font-semibold">{formatearPrecio(producto.price)}</span>{!producto.available && <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">Agotado</span>}</span>
            </button>
          </li>)}</ul>
        </section>)}
      </div>
      <DetalleProducto producto={seleccionado} dialogoRef={dialogo} alAgregar={agregar} />

      {pedidosHabilitados && <section aria-labelledby="carrito-titulo" className="mt-8 rounded-xl border border-gray-200 p-4">
        <h2 id="carrito-titulo" className="text-xl font-bold">Tu pedido</h2>
        {estadoCarrito.mostrarConfirmacion && resultado?.ok && <p role="status" className="mt-3 rounded-lg bg-teal-50 p-3 font-semibold text-teal-900">¡Pedido registrado! Tu número de pedido es <span className="text-xl">{resultado.numero}</span>.</p>}
        {estadoCarrito.mostrarVacio && <p className="mt-2 text-sm text-gray-600">Agrega productos para empezar.</p>}
        {estadoCarrito.mostrarFormulario && <>
        <ul className="mt-3 space-y-3">{carrito.map(({ producto, cantidad }) => <li key={producto.id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1"><span className="block font-medium">{producto.name}</span><span className="text-sm text-gray-600">{formatearPrecio(producto.price * cantidad)}</span></span>
          <button type="button" aria-label={`Quitar una unidad de ${producto.name}`} onClick={() => cambiarCantidad(producto.id, cantidad - 1)} className="h-10 w-10 rounded border">−</button><span aria-label="Cantidad" className="w-6 text-center">{cantidad}</span><button type="button" aria-label={`Agregar una unidad de ${producto.name}`} onClick={() => cambiarCantidad(producto.id, cantidad + 1)} disabled={cantidad >= 20} className="h-10 w-10 rounded border disabled:opacity-50">+</button>
        </li>)}</ul>
        <p className="mt-4 border-t pt-3 text-right font-bold">Total: {formatearPrecio(total)}</p>
        {resultado && !resultado.ok && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900"><p>{resultado.mensaje}</p>{resultado.problemas?.map((problema, i) => <p key={`${problema.nombre}-${i}`} className="mt-1 text-sm">{problema.nombre ?? "Producto"}: {problema.motivo === "PRECIO_CAMBIO" && problema.precioActualCentimos !== undefined ? `el precio actual es ${formatearPrecio(problema.precioActualCentimos / 100)}.` : problema.motivo === "AGOTADO" ? "está agotado." : problema.motivo === "INACTIVO" ? "ya no está disponible." : "no se encontró en esta carta."}</p>)}</div>}
        <button type="button" onClick={confirmar} disabled={enviando} className="mt-4 min-h-11 w-full rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{enviando ? "Registrando pedido…" : "Confirmar pedido"}</button>
        </>}
      </section>}
      {!pedidosHabilitados && <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">Pide al mesero que habilite esta mesa para registrar un pedido.</p>}
    </div>
  );
}
