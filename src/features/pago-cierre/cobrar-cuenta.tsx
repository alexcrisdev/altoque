"use client";

import { useState } from "react";
import { CorreoBoleta } from "./correo-boleta";
import type { CuentaACobrar } from "./pago-logica";
import { RegistrarPagoEfectivo } from "./registrar-pago-efectivo";
import { RegistrarPagoTarjeta } from "./registrar-pago-tarjeta";
import { RegistrarPagoYape } from "./registrar-pago-yape";

// US-022 / US-023 / US-024: un solo bloque de cobro con el método elegido.

const METODOS = [
  { valor: "CASH", etiqueta: "Efectivo" },
  { valor: "YAPE", etiqueta: "Yape" },
  { valor: "CARD", etiqueta: "Tarjeta" },
] as const;

type Metodo = (typeof METODOS)[number]["valor"];

export function CobrarCuenta({ cuenta, saldoCentimos, pedidoDestino }: {
  cuenta: CuentaACobrar; saldoCentimos: number; pedidoDestino?: { id: string; numero: number };
}) {
  const [metodo, setMetodo] = useState<Metodo>("CASH");
  const [correo, setCorreo] = useState("");

  return (
    <section aria-labelledby="registrar-pago" className="formulario-cobro mt-6 rounded-2xl border border-marca bg-superficie p-5 sm:p-6">
      <h2 id="registrar-pago" className="text-xl font-semibold">
        {pedidoDestino ? `Cobrar en efectivo · Pedido N.º ${pedidoDestino.numero}` : "Registrar pago"}
      </h2>

      {!pedidoDestino && <fieldset className="mt-3">
        <legend className="sr-only">Método de pago</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-borde bg-superficie-suave p-1">
          {METODOS.map((opcion) => (
            <label
              key={opcion.valor}
              className={`min-h-11 cursor-pointer rounded-lg px-3 py-3 text-center font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca ${
                metodo === opcion.valor ? "bg-marca text-white" : "text-texto hover:bg-superficie-suave"
              }`}
            >
              <input
                type="radio"
                name="metodo-pago"
                value={opcion.valor}
                checked={metodo === opcion.valor}
                onChange={() => setMetodo(opcion.valor)}
                className="sr-only"
              />
              {opcion.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>}

      <div className="mt-4">
        {saldoCentimos > 0 && <CorreoBoleta correo={correo} alCambiar={setCorreo} />}
        {(pedidoDestino || metodo === "CASH") && <RegistrarPagoEfectivo cuenta={cuenta} saldoCentimos={saldoCentimos}
          correo={correo} pedidoDestino={pedidoDestino?.id} />}
        {!pedidoDestino && metodo === "YAPE" && <RegistrarPagoYape cuenta={cuenta} saldoCentimos={saldoCentimos} correo={correo} />}
        {!pedidoDestino && metodo === "CARD" && <RegistrarPagoTarjeta cuenta={cuenta} saldoCentimos={saldoCentimos} correo={correo} />}
      </div>
    </section>
  );
}
