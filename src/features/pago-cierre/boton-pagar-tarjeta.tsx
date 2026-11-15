"use client";

import { useRef, useState } from "react";
import { Boton } from "../../components/ui";
import { iniciarPagoTarjetaAction } from "./pago-online-actions";
import { CorreoBoleta } from "./correo-boleta";

// US-076: lleva al cliente a la página de pago de Stripe. No manda ningún monto.
export function BotonPagarTarjeta({ token, clave }: { token: string; clave: string | null }) {
  const enCurso = useRef(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  const [correo, setCorreo] = useState("");

  async function pagar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setAbriendo(true);
    setError("");
    try {
      const resultado = await iniciarPagoTarjetaAction(token, clave, correo);
      if (resultado.ok) {
        window.location.assign(resultado.url);
        return; // El botón sigue desactivado mientras se abre Stripe.
      }
      setError(resultado.mensaje);
    } catch {
      setError("No pudimos abrir el pago con tarjeta. Revisa tu conexión e inténtalo otra vez.");
    }
    enCurso.current = false;
    setAbriendo(false);
  }

  return <div className="space-y-2">
    <CorreoBoleta correo={correo} alCambiar={setCorreo} disabled={abriendo} />
    <Boton type="button" className="w-full" onClick={pagar} disabled={abriendo}>
      {abriendo ? "Abriendo pago seguro…" : "Pagar con tarjeta"}
    </Boton>
    {error && <p role="alert" className="text-sm text-peligro-texto">{error}</p>}
  </div>;
}
