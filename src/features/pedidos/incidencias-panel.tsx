"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./estado-actions";
import { ETIQUETA_TIPO_INCIDENCIA, puedeMarcarEntregado, type TipoIncidencia } from "./incidencias";
import { registrarIncidenciaAction, resolverIncidenciaAction } from "./incidencias-actions";
import type { IncidenciaPedido } from "./incidencias-servidor";
import type { EstadoPedido } from "./estados";

function fecha(fechaIso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }).format(new Date(fechaIso));
}

export function IncidenciasPanel({ pedidoId, estado, incidencias, soloLectura = false }: {
  pedidoId: string; estado: EstadoPedido; incidencias: IncidenciaPedido[]; soloLectura?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoIncidencia>("FALTANTE");
  const [descripcion, setDescripcion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, startTransition] = useTransition();

  function marcarEntregado() {
    setMensaje("");
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(pedidoId, "DELIVERED");
      setMensaje(resultado.ok ? "Pedido marcado como entregado." : resultado.mensaje);
    });
  }
  function registrar() {
    setMensaje("");
    startTransition(async () => {
      const resultado = await registrarIncidenciaAction(pedidoId, tipo, descripcion);
      if (resultado.ok) setDescripcion("");
      else setMensaje(resultado.mensaje);
    });
  }
  function resolver(id: string) {
    setMensaje("");
    startTransition(async () => {
      const resultado = await resolverIncidenciaAction(pedidoId, id);
      if (!resultado.ok) setMensaje(resultado.mensaje);
    });
  }

  return <section className="mt-8 rounded-xl border p-5" aria-label="Entrega e incidencias">
    <h2 className="text-xl font-semibold">Entrega e incidencias</h2>
    {!soloLectura && puedeMarcarEntregado(estado) && <button type="button" disabled={guardando} onClick={marcarEntregado} className="mt-4 min-h-14 w-full rounded-lg bg-teal-700 px-5 py-3 text-lg font-semibold text-white disabled:opacity-50">{guardando ? "Guardando…" : "Confirmar entrega"}</button>}
    {estado === "CANCELLED" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">No se pueden registrar incidencias en pedidos cancelados.</p>}
    {!soloLectura && estado !== "CANCELLED" && <div className="mt-5 space-y-3">
      <h3 className="font-semibold">Registrar incidencia</h3>
      <label className="block text-sm">Tipo
        <select className="mt-1 min-h-11 w-full rounded border px-3" value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia)}>
          {Object.entries(ETIQUETA_TIPO_INCIDENCIA).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
      </label>
      <label className="block text-sm">Descripción
        <textarea className="mt-1 min-h-20 w-full rounded border p-3" minLength={3} maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <button type="button" disabled={guardando} onClick={registrar} className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50">{guardando ? "Guardando…" : "Registrar incidencia"}</button>
    </div>}
    {mensaje && <p role="alert" className="mt-3 text-red-700">{mensaje}</p>}
    <h3 className="mt-6 font-semibold">Incidencias registradas</h3>
    {incidencias.length === 0 ? <p className="mt-2 text-sm text-slate-600">No hay incidencias.</p> : <ul className="mt-3 space-y-3">
      {incidencias.map((incidencia) => <li key={incidencia.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2"><strong>{ETIQUETA_TIPO_INCIDENCIA[incidencia.tipo]}</strong><span className={`rounded-full px-2 py-1 text-sm ${incidencia.estado === "OPEN" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{incidencia.estado === "OPEN" ? "Abierta" : "Resuelta"}</span></div>
        <p className="mt-2">{incidencia.descripcion}</p><p className="mt-2 text-sm text-slate-600">Registrada por {incidencia.creadaPor} · {fecha(incidencia.creadaEn)}</p>
        {incidencia.resueltaPor && incidencia.resueltaEn && <p className="mt-1 text-sm text-slate-600">Resuelta por {incidencia.resueltaPor} · {fecha(incidencia.resueltaEn)}</p>}
        {!soloLectura && incidencia.estado === "OPEN" && <button type="button" disabled={guardando} onClick={() => resolver(incidencia.id)} className="mt-3 min-h-10 rounded border px-3 disabled:opacity-50">Marcar resuelta</button>}
      </li>)}
    </ul>}
  </section>;
}
