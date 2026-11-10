"use client";

import { useActionState } from "react";
import { guardarStockAction, type EstadoGuardarStock } from "@/features/carta/stock-actions";
import type { ProductoConStock } from "@/features/carta/stock-diario";

const estadoInicial: EstadoGuardarStock = { tipo: "inicial", mensaje: "" };

export function FormularioStock({ productos }: { productos: ProductoConStock[] }) {
  const [estado, accion, pendiente] = useActionState(guardarStockAction, estadoInicial);

  if (productos.length === 0) {
    return <p className="mt-4 rounded-xl border border-borde p-4">No hay productos activos para registrar.</p>;
  }

  return (
    <form action={accion} className="mt-5 grid gap-4">
      <p className="text-sm text-zinc-700">Deja el campo vacío para vender sin límite, siempre que aún no haya ventas hoy. Un valor de 0 indica que hoy no hay platos disponibles.</p>
      <ul className="grid gap-3">
        {productos.map((producto) => (
          <li key={producto.id} className="grid items-center gap-3 rounded-xl border border-borde bg-superficie p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div>
              <p className="font-semibold">{producto.name}</p>
              <p className="text-sm text-zinc-700">Vendidos hoy: {producto.vendidos}</p>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Platos de hoy
              <input
                name="cantidad"
                type="number"
                min={producto.vendidos}
                max={2147483647}
                step="1"
                defaultValue={producto.cantidad ?? ""}
                inputMode="numeric"
                aria-label={`Platos de hoy para ${producto.name}`}
                className="min-h-11 rounded-xl border border-borde bg-white px-3 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              />
            </label>
            <input type="hidden" name="productoId" value={producto.id} />
          </li>
        ))}
      </ul>
      <button disabled={pendiente} className="min-h-11 w-fit rounded-xl bg-teal-700 px-5 py-2 font-semibold text-white disabled:opacity-50">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} aria-live="polite" className={estado.tipo === "error" ? "text-red-700" : "text-teal-800"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
