"use client";

import { useMemo, useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./estado-actions";
import { modificarPedido } from "./modificar-actions";
import { calcularNuevoTotalCentimos, puedeModificar, requiereMotivoModificacion, type CambioPedido, type ItemModificable } from "./modificacion";
import { puedeCancelarPedido, type EstadoPedido } from "./estados";
import type { Rol } from "@/features/auth/permisos";
import { Boton } from "@/components/ui";

const moneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

// US-105: `pagado` viene de la base (pedido_pagado); con pago confirmado solo el dueño o el admin cancelan.
export function AccionesPedido({ pedidoId, estado, roles, items, pagado = false }: { pedidoId: string; estado: EstadoPedido; roles: Rol[]; items: ItemModificable[]; pagado?: boolean }) {
  const [cantidades, setCantidades] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.cantidad])));
  const [observaciones, setObservaciones] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.observacion ?? ""])));
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, startTransition] = useTransition();
  const puedeEditar = puedeModificar(estado, roles);
  const puedeCancelar = puedeCancelarPedido(estado, roles, pagado);
  const totalCentimos = useMemo(() => calcularNuevoTotalCentimos(items, items.map((item) => ({ itemId: item.id, cantidad: cantidades[item.id] ?? item.cantidad }))), [items, cantidades]);

  function guardar() {
    const cambios: CambioPedido[] = items.map((item) => ({ itemId: item.id, cantidad: cantidades[item.id] ?? item.cantidad, observacion: observaciones[item.id] ?? "" }));
    startTransition(async () => {
      const resultado = await modificarPedido(pedidoId, cambios, motivo);
      setMensaje(resultado.mensaje);
    });
  }

  function cancelar() {
    const razon = window.prompt(pagado
      ? "Este pedido ya está pagado: quedará una devolución pendiente. Escribe el motivo de cancelación:"
      : "Escribe el motivo de cancelación:");
    if (!razon?.trim()) return;
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(pedidoId, "CANCELLED", razon);
      setMensaje(resultado.ok ? (pagado ? "Pedido cancelado. Quedó registrada la devolución pendiente." : "Pedido cancelado.") : resultado.mensaje);
    });
  }

  if (!puedeEditar && !puedeCancelar) return null;
  return (
    <section className="mt-8 rounded-2xl border border-borde bg-superficie p-5 sm:p-6" aria-label="Acciones del pedido">
      <h2 className="text-xl font-semibold">Modificar pedido</h2>
      {puedeEditar && <>
        <ul className="mt-4 divide-y">
          {items.map((item) => {
            const cantidad = cantidades[item.id] ?? item.cantidad;
            return <li key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="break-words font-medium">{item.nombre} · {moneda.format(item.precioUnitarioCentimos * cantidad / 100)}</p>
                <label className="mt-2 block text-sm">Observación
                  <input className="mt-1 min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" maxLength={140} value={observaciones[item.id] ?? ""} onChange={(e) => setObservaciones({ ...observaciones, [item.id]: e.target.value })} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Boton type="button" variante="secundario" tamano="icono" aria-label={`Reducir ${item.nombre}`} onClick={() => setCantidades({ ...cantidades, [item.id]: Math.max(0, cantidad - 1) })}>−</Boton>
                <span className="min-w-8 text-center">{cantidad}</span>
                <Boton type="button" variante="secundario" tamano="icono" aria-label={`Aumentar ${item.nombre}`} onClick={() => setCantidades({ ...cantidades, [item.id]: Math.min(20, cantidad + 1) })}>+</Boton>
                <Boton type="button" variante="contorno" tamano="propio" className="px-3 text-sm text-texto" onClick={() => setCantidades({ ...cantidades, [item.id]: 0 })}>Quitar</Boton>
              </div>
            </li>;
          })}
        </ul>
        <label className="mt-3 block text-sm">Motivo {requiereMotivoModificacion(estado) ? "obligatorio" : "(opcional)"}
          <textarea className="mt-1 min-h-20 w-full rounded border p-3" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <p className="mt-4 font-semibold">Nuevo total: {moneda.format(totalCentimos / 100)}</p>
        <Boton type="button" tamano="propio" esquina="lg" cargando={guardando} disabled={requiereMotivoModificacion(estado) && !motivo.trim()} onClick={guardar} className="mt-4 px-4 py-2 font-medium">{guardando ? "Guardando…" : "Guardar cambios"}</Boton>
      </>}
      {puedeCancelar && <div className="mt-4">
        <Boton type="button" variante="peligro-contorno" tamano="propio" esquina="lg" disabled={guardando} onClick={cancelar} className="px-4 py-2">Cancelar pedido</Boton>
      </div>}
      {mensaje && <p role="status" className="mt-3">{mensaje}</p>}
    </section>
  );
}
