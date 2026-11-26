"use client";

import { useState, useTransition } from "react";
import { Boton, Insignia } from "../../components/ui";
import { formatearPrecio } from "../carta/formato";
import { marcarDevolucionAction } from "./devoluciones-actions";
import { ETIQUETA_DEVOLUCION, type Devolucion } from "./devoluciones-logica";

const fechaHora = (fecha: string) => new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", dateStyle: "short", timeStyle: "short",
}).format(new Date(fecha));
const fechaPedido = (fecha: string | null) => fecha
  ? new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(new Date(`${fecha}T00:00:00Z`))
  : null;

// US-105: una devolución (pendiente o hecha) con el botón para marcarla como devuelta.
export function DevolucionPedido({ devolucion, puedeMarcar }: { devolucion: Devolucion; puedeMarcar: boolean }) {
  const [mensaje, setMensaje] = useState("");
  const [guardando, startTransition] = useTransition();
  const pendiente = devolucion.estado === "PENDING";

  function marcar() {
    startTransition(async () => {
      const resultado = await marcarDevolucionAction(devolucion.id);
      setMensaje(resultado.ok ? "Devolución marcada como hecha." : resultado.mensaje);
    });
  }

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span>Pedido N.º {devolucion.numeroPedido}{fechaPedido(devolucion.fechaPedido) && ` · ${fechaPedido(devolucion.fechaPedido)}`}</span>
        <Insignia tono={pendiente ? "aviso" : "exito"}>{ETIQUETA_DEVOLUCION[devolucion.estado]}</Insignia>
      </p>
      <p>Devolver {formatearPrecio(devolucion.montoCentimos / 100)} · Motivo: {devolucion.motivo}</p>
      <p className="text-sm text-texto-suave">
        Cancelado por {devolucion.solicitadaPor ?? "Personal"} · {fechaHora(devolucion.solicitadaEn)}
        {devolucion.devueltaPor && devolucion.devueltaEn && ` · Devuelto por ${devolucion.devueltaPor} · ${fechaHora(devolucion.devueltaEn)}`}
      </p>
      {pendiente && puedeMarcar && (
        <Boton type="button" variante="secundario" disabled={guardando} onClick={marcar}>
          {guardando ? "Guardando…" : "Marcar como devuelto"}
        </Boton>
      )}
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
    </div>
  );
}

// Lista de caja: devoluciones que aún no se entregan al cliente.
export function DevolucionesPendientes({ devoluciones }: { devoluciones: Devolucion[] }) {
  if (devoluciones.length === 0) return null;
  return (
    <section aria-labelledby="devoluciones-titulo" className="mt-6 rounded-2xl border border-borde bg-superficie p-5">
      <h2 id="devoluciones-titulo" className="text-xl font-semibold">Devoluciones pendientes</h2>
      <p className="mt-1 text-sm text-texto-suave">Pedidos pagados que el dueño o el admin cancelaron. Marca cada una cuando entregues el dinero.</p>
      <ul className="mt-3 divide-y divide-borde">
        {devoluciones.map((devolucion) => (
          <li key={devolucion.id} className="py-3"><DevolucionPedido devolucion={devolucion} puedeMarcar /></li>
        ))}
      </ul>
    </section>
  );
}
