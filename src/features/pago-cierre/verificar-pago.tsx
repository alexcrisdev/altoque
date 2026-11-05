"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import { verificarPagoAction } from "./actions";
import type { CuentaACobrar } from "./pago-logica";

// US-023: botones para confirmar o rechazar un Yape "Por verificar".

export function VerificarPago({ cuenta, pagoId }: { cuenta: CuentaACobrar; pagoId: string }) {
  const [error, setError] = useState("");
  const [guardando, startTransition] = useTransition();

  function verificar(confirmar: boolean) {
    setError("");
    startTransition(async () => {
      try {
        const resultado = await verificarPagoAction(cuenta, pagoId, confirmar);
        if (!resultado.ok) setError(resultado.mensaje);
      } catch {
        setError("No se pudo conectar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <Boton type="button" disabled={guardando} onClick={() => verificar(true)}>
          {guardando ? "Guardando…" : "Confirmar recepción"}
        </Boton>
        <Boton type="button" variante="secundario" disabled={guardando} onClick={() => verificar(false)}>
          Rechazar
        </Boton>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-peligro-texto">{error}</p>}
    </div>
  );
}
