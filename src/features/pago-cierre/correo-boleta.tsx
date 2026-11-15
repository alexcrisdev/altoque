"use client";

import { useId } from "react";

export function CorreoBoleta({ correo, alCambiar, disabled = false }: { correo: string; alCambiar: (valor: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="my-3">
    <label htmlFor={id} className="block text-sm font-semibold text-texto">Correo para tu boleta (opcional)</label>
    <input id={id} type="email" autoComplete="email" maxLength={254} value={correo}
      onChange={(evento) => alCambiar(evento.target.value)} disabled={disabled}
      aria-describedby={`${id}-ayuda`} className="mt-1 min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-texto" />
    <p id={`${id}-ayuda`} className="mt-1 text-sm text-texto-suave">Solo lo usamos para enviarte la boleta.</p>
  </div>;
}
