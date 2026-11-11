"use client";

import { useEffect, useRef, useState } from "react";
import { mensajeEstadoCliente } from "./estado-cliente";
import type { EstadoPedido } from "./estados";

export function AvisoEstadoCliente({ estado, modalidad }: {
  estado: EstadoPedido | null;
  modalidad: "DINE_IN" | "TAKEAWAY";
}) {
  const audio = useRef<AudioContext | null>(null);
  const avisado = useRef(false);
  const [sonidoActivo, setSonidoActivo] = useState(false);

  async function activarSonido() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSonidoActivo(audio.current.state === "running");
    } catch {
      // El aviso visual funciona aunque el dispositivo no permita audio.
    }
  }

  useEffect(() => () => {
    const contexto = audio.current;
    audio.current = null;
    if (contexto && contexto.state !== "closed") void contexto.close().catch(() => {});
  }, []);

  useEffect(() => {
    if (estado !== "READY" || avisado.current) return;
    avisado.current = true;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Algunos navegadores bloquean la vibración.
    }
    try {
      audio.current ??= new AudioContext();
      const contexto = audio.current;
      // Si el navegador bloquea la reproducción automática, no dejamos
      // un sonido pendiente que se reproduzca mucho después del aviso.
      if (contexto.state !== "running") return;
      const tono = contexto.createOscillator();
      const volumen = contexto.createGain();
      tono.frequency.value = 880;
      volumen.gain.setValueAtTime(0.15, contexto.currentTime);
      volumen.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.6);
      tono.connect(volumen);
      volumen.connect(contexto.destination);
      tono.onended = () => { tono.disconnect(); volumen.disconnect(); };
      tono.start();
      tono.stop(contexto.currentTime + 0.6);
    } catch {
      // El sonido es opcional; nunca interrumpe la consulta del pedido.
    }
  }, [estado]);

  if (estado === null) return null;

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" aria-atomic="true"
        className={estado === "READY" ? "rounded-xl border-2 border-marca bg-marca/10 p-6" : undefined}>
        <p className={estado === "READY" ? "text-2xl font-bold text-texto" : "text-xl font-semibold text-texto"}>
          {mensajeEstadoCliente(estado, modalidad)}
        </p>
      </div>
      {estado !== "READY" && estado !== "DELIVERED" && estado !== "CANCELLED" && (
        <button type="button" onClick={activarSonido} disabled={sonidoActivo}
          className="rounded-lg border border-borde px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {sonidoActivo ? "Sonido activado" : "Activar sonido del aviso"}
        </button>
      )}
    </div>
  );
}
