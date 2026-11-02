"use client";

import { useState } from "react";
import type { CuentaACobrar } from "./pago-logica";
import { RegistrarPagoEfectivo } from "./registrar-pago-efectivo";
import { RegistrarPagoYape } from "./registrar-pago-yape";

// US-022 / US-023: un solo bloque de cobro con el método elegido.

const METODOS = [
  { valor: "CASH", etiqueta: "Efectivo" },
  { valor: "YAPE", etiqueta: "Yape" },
] as const;

type Metodo = (typeof METODOS)[number]["valor"];

export function CobrarCuenta({ cuenta, saldoCentimos }: { cuenta: CuentaACobrar; saldoCentimos: number }) {
  const [metodo, setMetodo] = useState<Metodo>("CASH");

  return (
    <section aria-labelledby="registrar-pago" className="mt-6 rounded-xl border-2 border-marca p-4">
      <h2 id="registrar-pago" className="text-xl font-semibold">Registrar pago</h2>

      <fieldset className="mt-3">
        <legend className="sr-only">Método de pago</legend>
        <div className="inline-flex rounded-lg border border-borde p-1">
          {METODOS.map((opcion) => (
            <label
              key={opcion.valor}
              className={`min-h-11 cursor-pointer rounded-md px-5 py-2 font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca ${
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
      </fieldset>

      <div className="mt-4">
        {metodo === "CASH" ? (
          <RegistrarPagoEfectivo cuenta={cuenta} saldoCentimos={saldoCentimos} />
        ) : (
          <RegistrarPagoYape cuenta={cuenta} saldoCentimos={saldoCentimos} />
        )}
      </div>
    </section>
  );
}
