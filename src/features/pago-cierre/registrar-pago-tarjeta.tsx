"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import { registrarPagoTarjetaAction } from "./actions";
import { centimosATexto, parsearSoles, validarPagoTarjeta, type CuentaACobrar } from "./pago-logica";

// US-024: el cliente paga con tarjeta en el POS del restaurante y el cajero anota el
// monto, la referencia del voucher y si el POS lo aprobó o rechazó. AlToque nunca
// recibe ni guarda el número de la tarjeta ni el CVV.

const soles = (centimos: number) => formatearPrecio(centimos / 100);

const RESULTADOS = [
  { valor: true, etiqueta: "Aprobado" },
  { valor: false, etiqueta: "Rechazado" },
] as const;

export function RegistrarPagoTarjeta({ cuenta, saldoCentimos }: { cuenta: CuentaACobrar; saldoCentimos: number }) {
  const [monto, setMonto] = useState(saldoCentimos > 0 ? centimosATexto(saldoCentimos) : "");
  const [referencia, setReferencia] = useState("");
  const [aprobado, setAprobado] = useState<boolean | null>(null);
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState<{ aprobado: boolean; texto: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  function registrar(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    setAviso(null);
    const invalido = validarPagoTarjeta(parsearSoles(monto), referencia, aprobado, saldoCentimos);
    if (invalido) {
      setError(invalido);
      return;
    }
    startTransition(async () => {
      try {
        const resultado = await registrarPagoTarjetaAction(cuenta, monto, referencia, aprobado, clave);
        if (!resultado.ok) {
          setError(resultado.mensaje);
          return;
        }
        setAviso(
          resultado.aprobado
            ? { aprobado: true, texto: "Pago con tarjeta aprobado. El saldo ya se actualizó." }
            : {
                aprobado: false,
                texto: "Pago rechazado por el POS. La cuenta sigue pendiente: pide otra tarjeta u otro medio de pago.",
              },
        );
        setClave(crypto.randomUUID());
        setReferencia("");
        setAprobado(null);
      } catch {
        setError("No se pudo conectar. Revisa tu conexión y vuelve a pulsar «Registrar pago con tarjeta».");
      }
    });
  }

  return (
    <div>
      {aviso && (
        <p
          role={aviso.aprobado ? "status" : "alert"}
          className={`rounded-lg border p-3 font-semibold ${
            aviso.aprobado
              ? "border-exito-borde bg-exito-fondo text-exito-texto"
              : "border-peligro-borde bg-peligro-fondo text-peligro-texto"
          }`}
        >
          {aviso.texto}
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
              aria-describedby="ayuda-monto-tarjeta"
            />
            <span id="ayuda-monto-tarjeta" className="mt-1 block text-xs text-texto-suave">
              Saldo pendiente: {soles(saldoCentimos)}.
            </span>
          </label>

          <label className="block text-sm font-medium">
            Referencia del voucher
            <input
              autoComplete="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-borde px-3 text-lg"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. 004512"
              maxLength={40}
              aria-describedby="ayuda-referencia-tarjeta"
            />
            <span id="ayuda-referencia-tarjeta" className="mt-1 block text-xs text-texto-suave">
              N.º de operación o código de autorización impreso en el voucher.
            </span>
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Resultado en el POS</legend>
            <div className="mt-1 inline-flex rounded-lg border border-borde p-1">
              {RESULTADOS.map((opcion) => (
                <label
                  key={opcion.etiqueta}
                  className={`min-h-11 cursor-pointer rounded-md px-5 py-2 font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca ${
                    aprobado === opcion.valor ? "bg-marca text-white" : "text-texto hover:bg-superficie-suave"
                  }`}
                >
                  <input
                    type="radio"
                    name="resultado-pos"
                    checked={aprobado === opcion.valor}
                    onChange={() => setAprobado(opcion.valor)}
                    className="sr-only"
                  />
                  {opcion.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="text-sm text-texto-suave sm:col-span-2">
            Nunca escribas el número de la tarjeta ni el CVV: el cobro se hace en el POS y aquí solo se anota
            el resultado. Un pago rechazado queda registrado, pero no descuenta del saldo.
          </p>

          {error && <p role="alert" className="text-peligro-texto sm:col-span-2">{error}</p>}

          <Boton type="submit" tamano="lg" disabled={guardando} className="sm:col-span-2">
            {guardando ? "Registrando…" : "Registrar pago con tarjeta"}
          </Boton>
        </form>
      )}
    </div>
  );
}
