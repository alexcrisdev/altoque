"use client";

import { useMemo, useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./estado-actions";
import { modificarPedido } from "./modificar-actions";
import { calcularNuevoTotalCentimos, puedeModificar, requiereMotivoModificacion, type CambioPedido, type ItemModificable } from "./modificacion";
import { puedeCambiarEstado, type EstadoPedido } from "./estados";
import type { Rol } from "@/features/auth/permisos";

const moneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export function AccionesPedido({ pedidoId, estado, roles, items }: { pedidoId: string; estado: EstadoPedido; roles: Rol[]; items: ItemModificable[] }) {
  const [cantidades, setCantidades] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.cantidad])));
  const [observaciones, setObservaciones] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.observacion ?? ""])));
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, startTransition] = useTransition();
  const puedeEditar = puedeModificar(estado, roles);
  const puedeCancelar = puedeCambiarEstado(
    estado,
    "CANCELLED",
    roles
  );
  const totalCentimos = useMemo(() => calcularNuevoTotalCentimos(items, items.map((item) => ({ itemId: item.id, cantidad: cantidades[item.id] ?? item.cantidad }))), [items, cantidades]);

  function guardar() {
    const cambios: CambioPedido[] = items.map((item) => ({ itemId: item.id, cantidad: cantidades[item.id] ?? item.cantidad, observacion: observaciones[item.id] ?? "" }));
    startTransition(async () => {
      const resultado = await modificarPedido(pedidoId, cambios, motivo);
      setMensaje(resultado.mensaje);
    });
  }

  function cancelar() {
    const razon = window.prompt("Escribe el motivo de cancelación:");
    if (!razon?.trim()) return;
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(pedidoId, "CANCELLED", razon);
      setMensaje(resultado.ok ? "Pedido cancelado." : resultado.mensaje);
    });
  }

  if (!puedeEditar && !puedeCancelar) return null;
  return (
    <section className="mt-8 rounded-xl border p-5" aria-label="Acciones del pedido">
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
                <button type="button" aria-label={`Reducir ${item.nombre}`} className="h-11 w-11 rounded-xl border border-borde bg-superficie text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" onClick={() => setCantidades({ ...cantidades, [item.id]: Math.max(0, cantidad - 1) })}>−</button>
                <span className="min-w-8 text-center">{cantidad}</span>
                <button type="button" aria-label={`Aumentar ${item.nombre}`} className="h-11 w-11 rounded-xl border border-borde bg-superficie text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" onClick={() => setCantidades({ ...cantidades, [item.id]: Math.min(20, cantidad + 1) })}>+</button>
                <button type="button" className="min-h-11 rounded-xl border border-borde px-3 text-sm text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" onClick={() => setCantidades({ ...cantidades, [item.id]: 0 })}>Quitar</button>
              </div>
            </li>;
          })}
        </ul>
        <label className="mt-3 block text-sm">Motivo {requiereMotivoModificacion(estado) ? "obligatorio" : "(opcional)"}
          <textarea className="mt-1 min-h-20 w-full rounded border p-3" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <p className="mt-4 font-semibold">Nuevo total: {moneda.format(totalCentimos / 100)}</p>
        <button type="button" disabled={guardando || (requiereMotivoModificacion(estado) && !motivo.trim())} onClick={guardar} className="mt-4 min-h-11 rounded-lg bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-50">{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </>}
      {puedeCancelar && <div className="mt-4">
        <button type="button" disabled={guardando} onClick={cancelar} className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-red-800 disabled:opacity-50">Cancelar pedido</button>
      </div>}
      {mensaje && <p role="status" className="mt-3">{mensaje}</p>}
    </section>
  );
}
