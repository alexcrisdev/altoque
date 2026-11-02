"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import { registrarPagoEfectivoAction } from "./actions";
import {
  calcularVuelto,
  centimosATexto,
  parsearSoles,
  validarPagoEfectivo,
  type CuentaACobrar,
} from "./pago-logica";

// US-022: cobro en efectivo. El cajero escribe cuánto cobra (por defecto todo
// el saldo) y cuánto le entregó el cliente; ve el vuelto antes de registrar.

const soles = (centimos: number) => formatearPrecio(centimos / 100);

export function RegistrarPagoEfectivo({ cuenta, saldoCentimos }: { cuenta: CuentaACobrar; saldoCentimos: number }) {
  const [monto, setMonto] = useState(saldoCentimos > 0 ? centimosATexto(saldoCentimos) : "");
  const [recibido, setRecibido] = useState("");
  // La misma clave en cada reintento: si el primer envío sí llegó, la base no crea otro pago.
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, startTransition] = useTransition();

  const montoCentimos = parsearSoles(monto);
  const recibidoCentimos = parsearSoles(recibido);
  const vuelto = montoCentimos !== null && recibidoCentimos !== null ? calcularVuelto(montoCentimos, recibidoCentimos) : null;

  function registrar(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    setExito("");
    const invalido = validarPagoEfectivo(montoCentimos, recibidoCentimos, saldoCentimos);
    if (invalido) {
      setError(invalido);
      return;
    }
    startTransition(async () => {
      try {
        const resultado = await registrarPagoEfectivoAction(cuenta, monto, recibido, clave);
        if (!resultado.ok) {
          setError(resultado.mensaje);
          return;
        }
        const nuevoSaldo = saldoCentimos - (montoCentimos ?? 0);
        setExito(`Pago registrado. Vuelto: ${soles(resultado.vueltoCentimos)}.`);
        setClave(crypto.randomUUID());
        setMonto(nuevoSaldo > 0 ? centimosATexto(nuevoSaldo) : "");
        setRecibido("");
      } catch {
        // Sin conexión: se puede reintentar con la misma clave sin duplicar el pago.
        setError("No se pudo conectar. Revisa tu conexión y vuelve a pulsar «Registrar pago».");
      }
    });
  }

  return (
    <section aria-labelledby="cobrar-efectivo" className="mt-6 rounded-xl border-2 border-marca p-4">
      <h2 id="cobrar-efectivo" className="text-xl font-semibold">Cobrar en efectivo</h2>

      {exito && (
        <p role="status" className="mt-3 rounded-lg border border-exito-borde bg-exito-fondo p-3 text-lg font-semibold text-exito-texto">
          {exito}
        </p>
      )}

      {saldoCentimos <= 0 ? (
        <p className="mt-3 text-texto-suave">La cuenta no tiene saldo pendiente.</p>
      ) : (
        <form onSubmit={registrar} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <label className="block text-sm font-medium">
            Monto a cobrar (S/)
            <input
              inputMode="decimal"
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-borde px-3 text-lg"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-describedby="ayuda-monto"
            />
            <span id="ayuda-monto" className="mt-1 block text-xs text-texto-suave">
              Saldo pendiente: {soles(saldoCentimos)}. Puedes cobrar una parte.
            </span>
          </label>

          <label className="block text-sm font-medium">
            Efectivo recibido (S/)
            <input
              inputMode="decimal"
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-borde px-3 text-lg"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              placeholder="Ej. 50"
            />
          </label>

          <p className="text-lg sm:col-span-2" aria-live="polite">
            Vuelto:{" "}
            <strong>
              {vuelto !== null
                ? soles(vuelto)
                : recibidoCentimos !== null && montoCentimos !== null
                  ? "el efectivo no alcanza"
                  : "—"}
            </strong>
          </p>

          {error && (
            <p role="alert" className="text-peligro-texto sm:col-span-2">{error}</p>
          )}

          <Boton type="submit" tamano="lg" disabled={guardando} className="sm:col-span-2">
            {guardando ? "Registrando…" : "Registrar pago"}
          </Boton>
        </form>
      )}
    </section>
  );
}
