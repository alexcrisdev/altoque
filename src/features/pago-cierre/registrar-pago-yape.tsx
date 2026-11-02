"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import { registrarPagoYapeAction } from "./actions";
import { centimosATexto, normalizarReferencia, parsearSoles, validarPagoYape, type CuentaACobrar } from "./pago-logica";

// US-023: el cliente paga al Yape del restaurante y el cajero anota el monto y el
// n.º de operación. El pago queda "Por verificar": no baja el saldo todavía.

const soles = (centimos: number) => formatearPrecio(centimos / 100);

export function RegistrarPagoYape({ cuenta, saldoCentimos }: { cuenta: CuentaACobrar; saldoCentimos: number }) {
  const [monto, setMonto] = useState(saldoCentimos > 0 ? centimosATexto(saldoCentimos) : "");
  const [referencia, setReferencia] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, startTransition] = useTransition();

  function registrar(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    setExito("");
    const invalido = validarPagoYape(parsearSoles(monto), normalizarReferencia(referencia), saldoCentimos);
    if (invalido) {
      setError(invalido);
      return;
    }
    startTransition(async () => {
      try {
        const resultado = await registrarPagoYapeAction(cuenta, monto, referencia, clave);
        if (!resultado.ok) {
          setError(resultado.mensaje);
          return;
        }
        setExito("Yape registrado como «Por verificar». Confírmalo abajo cuando veas el pago en el Yape del negocio.");
        setClave(crypto.randomUUID());
        setReferencia("");
      } catch {
        setError("No se pudo conectar. Revisa tu conexión y vuelve a pulsar «Registrar Yape».");
      }
    });
  }

  return (
    <div>
      {exito && (
        <p role="status" className="rounded-lg border border-info-borde bg-info-fondo p-3 font-semibold text-info-texto">
          {exito}
        </p>
      )}

      {saldoCentimos <= 0 ? (
        <p className="mt-3 text-texto-suave">La cuenta no tiene saldo pendiente.</p>
      ) : (
        <form onSubmit={registrar} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <label className="block text-sm font-medium">
            Monto (S/)
            <input
              inputMode="decimal"
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-borde px-3 text-lg"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-describedby="ayuda-monto-yape"
            />
            <span id="ayuda-monto-yape" className="mt-1 block text-xs text-texto-suave">
              Saldo pendiente: {soles(saldoCentimos)}.
            </span>
          </label>

          <label className="block text-sm font-medium">
            N.º de operación de Yape
            <input
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-borde px-3 text-lg"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. 12345678"
              maxLength={40}
            />
          </label>

          <p className="text-sm text-texto-suave sm:col-span-2">
            El pago no se descuenta hasta confirmarlo. Confírmalo solo cuando veas el dinero en el Yape del
            negocio: una captura del cliente no es suficiente.
          </p>

          {error && <p role="alert" className="text-peligro-texto sm:col-span-2">{error}</p>}

          <Boton type="submit" tamano="lg" disabled={guardando} className="sm:col-span-2">
            {guardando ? "Registrando…" : "Registrar Yape"}
          </Boton>
        </form>
      )}
    </div>
  );
}
