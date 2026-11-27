"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Tarjeta } from "@/components/ui";
import { modificarPedidoClienteAction } from "./edicion-cliente-actions";
import type { EdicionCliente } from "./edicion-cliente-datos";
import { calcularNuevoTotalCentimos, validarCambios, type CambioPedido } from "./modificacion";

type Borrador = { base: EdicionCliente; cambios: CambioPedido[] };
const moneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export function EditarPedidoCliente({ token, clave, edicion }: {
  token: string; clave: string; edicion: EdicionCliente;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [confirmandoAnulacion, setConfirmandoAnulacion] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [guardando, iniciarGuardado] = useTransition();

  function abrir() {
    setMensaje("");
    setBorrador({
      base: edicion,
      cambios: edicion.items.map((item) => ({
        itemId: item.id, cantidad: item.cantidad, observacion: item.observacion,
      })),
    });
  }

  function editar(itemId: string, cambio: Partial<Omit<CambioPedido, "itemId">>) {
    setMensaje("");
    setBorrador((actual) => actual && ({
      ...actual, cambios: actual.cambios.map((fila) => fila.itemId === itemId ? { ...fila, ...cambio } : fila),
    }));
  }

  function guardar(anular: boolean) {
    if (!borrador || guardando) return;
    const validacion = validarCambios(borrador.base.items, borrador.cambios);
    if (!validacion.ok && !(anular && validacion.codigo === "ORDER_EMPTY")) {
      if (validacion.codigo === "ORDER_EMPTY") setConfirmandoAnulacion(true);
      else setMensaje("Revisa las cantidades y observaciones.");
      return;
    }
    setMensaje("");
    iniciarGuardado(async () => {
      const resultado = await modificarPedidoClienteAction(
        token, clave, borrador.base.revision, borrador.cambios, anular,
      );
      setConfirmandoAnulacion(false);
      if (resultado.ok || resultado.recargar) {
        setBorrador(null);
        router.refresh();
      }
      setMensaje(resultado.ok
        ? (resultado.cancelado ? "Pedido anulado." : "Guardamos los cambios de tu pedido.")
        : resultado.mensaje);
    });
  }

  if (!borrador) return (
    <div className="space-y-2">
      <Boton type="button" variante="secundario" onClick={abrir} disabled={guardando}>
        Modificar pedido
      </Boton>
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
    </div>
  );

  const total = calcularNuevoTotalCentimos(borrador.base.items, borrador.cambios);
  return (
    <Tarjeta className="space-y-4">
      <h2 className="font-semibold">Modificar pedido</h2>
      <p className="text-sm text-texto-suave">Para agregar otro plato, haz un nuevo pedido desde la carta.</p>
      <ul className="divide-y divide-borde">
        {borrador.base.items.map((item, indice) => {
          const cambio = borrador.cambios[indice];
          const puedeEditar = !guardando && !confirmandoAnulacion;
          return (
            <li key={item.id} className="space-y-2 py-3">
              <p className="font-medium">{item.nombre}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Boton type="button" variante="secundario" aria-label={`Reducir ${item.nombre}`}
                  disabled={!puedeEditar || cambio.cantidad === 0}
                  onClick={() => editar(item.id, { cantidad: cambio.cantidad - 1 })}>−</Boton>
                <span className="min-w-8 text-center tabular-nums" aria-label={`Cantidad de ${item.nombre}`}>{cambio.cantidad}</span>
                <Boton type="button" variante="secundario" aria-label={`Aumentar ${item.nombre}`}
                  disabled={!puedeEditar || cambio.cantidad >= 20}
                  onClick={() => editar(item.id, { cantidad: cambio.cantidad + 1 })}>+</Boton>
                <Boton type="button" variante="secundario" aria-label={`Quitar ${item.nombre}`}
                  disabled={!puedeEditar || cambio.cantidad === 0}
                  onClick={() => editar(item.id, { cantidad: 0 })}>Quitar</Boton>
              </div>
              {cambio.cantidad > 0 && (
                <label className="block text-sm">
                  Observación para {item.nombre}
                  <input className="mt-1 min-h-11 w-full rounded-xl border border-borde bg-superficie px-3"
                    maxLength={140} value={cambio.observacion ?? ""} disabled={!puedeEditar}
                    onChange={(event) => editar(item.id, { observacion: event.target.value })} />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="font-semibold tabular-nums" aria-live="polite">Nuevo total: {moneda.format(total / 100)}</p>
      {confirmandoAnulacion ? (
        <div className="space-y-2">
          <p role="alert">Quitaste todos los platos. ¿Quieres anular este pedido?</p>
          <div className="flex flex-wrap gap-2">
            <Boton type="button" cargando={guardando} onClick={() => guardar(true)}>Sí, anular pedido</Boton>
            <Boton type="button" variante="secundario" disabled={guardando}
              onClick={() => setConfirmandoAnulacion(false)}>Seguir editando</Boton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Boton type="button" cargando={guardando} onClick={() => guardar(false)}>Guardar cambios</Boton>
          <Boton type="button" variante="secundario" disabled={guardando}
            onClick={() => { setBorrador(null); setMensaje(""); }}>Salir sin guardar</Boton>
        </div>
      )}
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
    </Tarjeta>
  );
}
