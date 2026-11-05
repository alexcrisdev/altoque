"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import { cerrarCuentaAction } from "./actions";
import { MOTIVO_MAXIMO, normalizarMotivo, validarMotivo, type EstadoCierre } from "./cierre-logica";
import type { CuentaACobrar } from "./pago-logica";

// US-020: cerrar la cuenta. Pide confirmar antes de cerrar; si queda saldo y el
// usuario es dueño o admin, puede cerrarla como excepción escribiendo el motivo.

export function CerrarCuenta({ cuenta, estado }: { cuenta: CuentaACobrar; estado: EstadoCierre }) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, startTransition] = useTransition();

  function cerrar(conMotivo: boolean) {
    setError("");
    const motivoLimpio = conMotivo ? normalizarMotivo(motivo) : null;
    if (conMotivo) {
      const invalido = validarMotivo(motivoLimpio);
      if (invalido) {
        setError(invalido);
        return;
      }
    }
    startTransition(async () => {
      try {
        const resultado = await cerrarCuentaAction(cuenta, motivoLimpio);
        if (!resultado.ok) setError(resultado.mensaje);
      } catch {
        setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section aria-labelledby="cerrar-cuenta" className="mt-6 rounded-xl border-2 p-4">
      <h2 id="cerrar-cuenta" className="text-xl font-semibold">Cerrar cuenta</h2>
      <p role="status" className={`mt-2 ${estado.ordinario ? "text-exito-texto" : "text-aviso-texto"}`}>{estado.aviso}</p>

      {estado.ordinario && !confirmando && (
        <Boton type="button" tamano="lg" className="mt-4" onClick={() => setConfirmando(true)}>
          Cerrar cuenta
        </Boton>
      )}
      {estado.ordinario && confirmando && (
        <div className="mt-4">
          <p className="font-medium">
            {cuenta.tipo === "MESA"
              ? "Se cerrará la cuenta y la mesa quedará libre. ¿Confirmas?"
              : "Se cerrará la cuenta del pedido para llevar. ¿Confirmas?"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton type="button" disabled={guardando} onClick={() => cerrar(false)}>
              {guardando ? "Cerrando…" : "Sí, cerrar cuenta"}
            </Boton>
            <Boton type="button" variante="secundario" disabled={guardando} onClick={() => setConfirmando(false)}>
              Volver
            </Boton>
          </div>
        </div>
      )}

      {estado.excepcion && (
        <form
          className="mt-4 grid gap-3"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            cerrar(true);
          }}
        >
          <label className="block text-sm font-medium">
            Motivo de la excepción
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-borde p-3"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MOTIVO_MAXIMO}
              aria-describedby="ayuda-motivo"
            />
            <span id="ayuda-motivo" className="mt-1 block text-xs text-texto-suave">
              Queda registrado con tu nombre, la hora y el saldo que no se cobró. Ej.: «Cortesía de la casa
              autorizada por el dueño».
            </span>
          </label>
          <Boton type="submit" variante="peligro" disabled={guardando}>
            {guardando ? "Cerrando…" : "Cerrar con excepción"}
          </Boton>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-peligro-texto">{error}</p>}
    </section>
  );
}
