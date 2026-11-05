"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boton, Insignia, MensajeEstado } from "@/components/ui";
import { ETIQUETA_TIPO_INCIDENCIA, TIPOS_INCIDENCIA_COCINA, validarIncidencia, mensajeErrorIncidencia } from "../pedidos/incidencias";
import { registrarIncidenciaAction, resolverIncidenciaAction } from "../pedidos/incidencias-actions";
import type { EstadoPedido } from "../pedidos/estados";
import { puedeReportarIncidencia } from "./cocina-logica";

export function ReportarIncidencia({ pedidoId, estado, numero }: {
  pedidoId: string; estado: EstadoPedido; numero: number;
}) {
  const router = useRouter();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS_INCIDENCIA_COCINA)[number]>(TIPOS_INCIDENCIA_COCINA[0]);
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [reportado, setReportado] = useState(false);
  const [guardando, iniciarTransicion] = useTransition();
  const bloqueo = useRef(false);
  if (!puedeReportarIncidencia(estado)) return null;

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (bloqueo.current) return;
    const invalido = validarIncidencia(tipo, descripcion);
    if (invalido) { setError(invalido); return; }
    bloqueo.current = true;
    setError("");
    iniciarTransicion(async () => {
      try {
        const resultado = await registrarIncidenciaAction(pedidoId, tipo, descripcion);
        if (!resultado.ok) { setError(resultado.mensaje); return; }
        setAbierto(false);
        setDescripcion("");
        setReportado(true);
        router.refresh();
      } catch {
        setError(mensajeErrorIncidencia(""));
      } finally { bloqueo.current = false; }
    });
  }

  return <div className="mt-4 space-y-3">
    {reportado && <p role="status"><Insignia tono="exito">Problema reportado</Insignia></p>}
    {!abierto ? <Boton type="button" variante="secundario" tamano="lg" className="w-full"
      aria-expanded={false} aria-controls={id} aria-label={`Reportar problema del pedido N.º ${numero}`}
      onClick={() => { setAbierto(true); setReportado(false); setError(""); }}>Reportar problema</Boton> :
      <form id={id} onSubmit={enviar} className="space-y-3" aria-label={`Reportar problema del pedido N.º ${numero}`}>
        <fieldset disabled={guardando} className="space-y-3">
          <legend className="font-semibold">Reportar problema</legend>
          <label className="grid gap-1 text-sm">Tipo de problema
            <select value={tipo} onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
              className="min-h-11 w-full rounded-xl border border-borde bg-superficie p-3 text-texto">
              {TIPOS_INCIDENCIA_COCINA.map((opcion) => <option key={opcion} value={opcion}>{ETIQUETA_TIPO_INCIDENCIA[opcion]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Descripción (3 a 300 caracteres)
            <textarea value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} required minLength={3} maxLength={300} rows={3}
              className="w-full rounded-xl border border-borde bg-superficie p-3 text-texto" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" tamano="lg" disabled={guardando}>{guardando ? "Guardando…" : "Enviar"}</Boton>
            <Boton type="button" variante="secundario" tamano="lg" disabled={guardando}
              onClick={() => { setAbierto(false); setError(""); }}>Cancelar</Boton>
          </div>
        </fieldset>
        {error && <MensajeEstado tipo="error" titulo={error} />}
      </form>}
  </div>;
}

export function MarcarIncidenciaResuelta({ pedidoId, incidenciaId, descripcion }: {
  pedidoId: string; incidenciaId: string; descripcion: string;
}) {
  const router = useRouter();
  const [guardando, iniciarTransicion] = useTransition();
  const [error, setError] = useState("");
  const bloqueo = useRef(false);
  function resolver() {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setError("");
    iniciarTransicion(async () => {
      try {
        const resultado = await resolverIncidenciaAction(pedidoId, incidenciaId);
        if (!resultado.ok) { setError(resultado.mensaje); return; }
        router.refresh();
      } catch { setError(mensajeErrorIncidencia("")); }
      finally { bloqueo.current = false; }
    });
  }
  return <div className="mt-2 space-y-2">
    <Boton type="button" variante="secundario" tamano="lg" className="w-full" disabled={guardando}
      aria-label={`Marcar resuelta la incidencia: ${descripcion}`} onClick={resolver}>{guardando ? "Guardando…" : "Marcar resuelta"}</Boton>
    {error && <MensajeEstado tipo="error" titulo={error} />}
  </div>;
}
