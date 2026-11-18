"use client";

import { useActionState, useState } from "react";
import { Boton } from "../../../components/ui/boton";
import { Insignia } from "../../../components/ui/insignia";
import { guardarStockConPrediccionAction } from "../../../features/carta/stock-prediccion-actions";
import type { EstadoGuardarStock } from "../../../features/carta/stock-actions";
import type { ProductoConStock } from "../../../features/carta/stock-diario";
import {
  crearEstadoStock,
  deshacerRellenoStock,
  editarCantidadStock,
  rellenarStockConPrediccion,
  type SugerenciaStock,
} from "../../../features/carta/rellenar-stock-logica";

type Props = {
  fecha: string;
  productos: ProductoConStock[];
  sugerencias: SugerenciaStock[];
};

const estadoInicial: EstadoGuardarStock = {
  tipo: "inicial",
  mensaje: "",
};

const ETIQUETA = {
  registrado: "Registrado",
  prediccion: "Predicción",
  editado: "Editado por ti",
  sin_prediccion: "Sin predicción",
};

export function FormularioStock({
  fecha,
  productos,
  sugerencias,
}: Props) {
  const [relleno, setRelleno] = useState(
    () => crearEstadoStock(productos),
  );

  const [estado, accion, pendiente] = useActionState(
    async (anterior: EstadoGuardarStock, datos: FormData) => {
      const resultado = await guardarStockConPrediccionAction(
        anterior,
        datos,
      );

      if (resultado.tipo === "exito") {
        setRelleno((actual) => ({
          anteriores: null,
          campos: actual.campos.map((campo) => ({
            ...campo,
            origen: "registrado",
          })),
        }));
      }

      return resultado;
    },
    estadoInicial,
  );

  const porProducto = new Map(
    sugerencias.map((fila) => [fila.productoId, fila]),
  );

  const puedeRellenar = relleno.campos.some(
    (campo) => porProducto.has(campo.productoId),
  );

  if (productos.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-borde p-4">
        No hay productos activos para registrar.
      </p>
    );
  }

  return (
    <form action={accion} className="mt-5 grid gap-4">
      <input type="hidden" name="fecha" value={fecha} />

      <p className="text-sm text-texto-suave">
        Deja el campo vacío para vender sin límite si aún no hay
        ventas hoy. Un valor de 0 indica que no hay unidades disponibles.
      </p>

      <fieldset
        disabled={pendiente}
        className="grid min-w-0 gap-4"
      >
        <legend className="sr-only">
          Cantidades del stock de hoy
        </legend>

        <div className="flex flex-wrap gap-2">
          {puedeRellenar && (
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setRelleno((actual) =>
                rellenarStockConPrediccion(actual, sugerencias)
              )}
            >
              Rellenar con la predicción
            </Boton>
          )}

          {relleno.anteriores !== null && (
            <Boton
              type="button"
              variante="fantasma"
              onClick={() => setRelleno(deshacerRellenoStock)}
            >
              Deshacer relleno
            </Boton>
          )}
        </div>

        {puedeRellenar && (
          <p className="text-sm text-texto-suave">
            Rellenar no guarda los cambios. Revisa las cantidades
            y pulsa Guardar. El rango es orientativo, no un
            intervalo de confianza.
          </p>
        )}

        <ul className="grid gap-3">
          {relleno.campos.map((campo) => {
            const sugerencia = porProducto.get(campo.productoId);
            const insuficiente =
              campo.valor !== "" &&
              Number(campo.valor) < campo.vendidos;

            return (
              <li
                key={campo.productoId}
                className="grid items-center gap-3 rounded-xl border border-borde bg-superficie p-4 sm:grid-cols-[minmax(0,1fr)_12rem]"
              >
                <div className="min-w-0 space-y-2">
                  <p className="break-words font-semibold">
                    {campo.nombre}
                  </p>

                  <p className="text-sm text-texto-suave">
                    Vendidos hoy: {campo.vendidos}
                  </p>

                  <p className="text-sm">
                    {sugerencia ? (
                      <>
                        Sugerencia:{" "}
                        <span className="font-semibold">
                          ~{sugerencia.cantidad}{" "}
                          ({sugerencia.minimo}–{sugerencia.maximo})
                        </span>
                      </>
                    ) : "Sin predicción"}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Insignia
                      tono={
                        campo.origen === "prediccion"
                          ? "info"
                          : "neutro"
                      }
                    >
                      {ETIQUETA[campo.origen]}
                    </Insignia>

                    {sugerencia?.modelo.endsWith("-demo") && (
                      <Insignia tono="aviso">Demo</Insignia>
                    )}
                  </div>

                  {!sugerencia && campo.vendidos > 0 && (
                    <p className="text-sm text-texto-suave">
                      Se conserva el stock porque ya hay ventas hoy.
                    </p>
                  )}

                  {insuficiente && (
                    <p className="text-sm text-peligro-texto">
                      Ajusta la cantidad: no puede ser menor que
                      lo vendido.
                    </p>
                  )}
                </div>

                <label className="grid gap-1 text-sm font-medium">
                  Unidades de hoy
                  <input
                    name="cantidad"
                    type="number"
                    min={campo.vendidos}
                    max={2147483647}
                    step="1"
                    required={campo.vendidos > 0}
                    value={campo.valor}
                    inputMode="numeric"
                    aria-label={`Unidades de hoy para ${campo.nombre}`}
                    onChange={(evento) => {
                      const valor = evento.currentTarget.value;
                      setRelleno((actual) =>
                        editarCantidadStock(
                          actual,
                          campo.productoId,
                          valor,
                        )
                      );
                    }}
                    className="min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                  />
                </label>

                <input
                  type="hidden"
                  name="productoId"
                  value={campo.productoId}
                />
              </li>
            );
          })}
        </ul>

        <Boton type="submit" className="w-fit">
          {pendiente ? "Guardando…" : "Guardar"}
        </Boton>
      </fieldset>

      {estado.mensaje && (
        <p
          role={estado.tipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className={
            estado.tipo === "error"
              ? "text-peligro-texto"
              : "text-texto"
          }
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
