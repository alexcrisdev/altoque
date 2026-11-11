"use client";

import { useState, type FormEvent } from "react";
import { Boton, Tarjeta } from "@/components/ui";
import { consultarMapaCalorAction } from "./mapa-calor-actions";
import { leerPedidosSinteticos } from "./mapa-calor-csv";
import {
  calcularMapaCalor,
  DIAS_MAPA,
  type FiltroMapa,
} from "./mapa-calor-logica";

type Mapa = ReturnType<typeof calcularMapaCalor>;

type VistaMapa = {
  mapa: Mapa;
  desde: string;
  hasta: string;
  permiteSugerencias: boolean;
};

const claseCampo =
  "min-h-11 w-full rounded-xl border border-borde " +
  "bg-superficie px-3 py-2 text-texto " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-marca";

function hoyEnLima(): string {
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function MapaCalorPanel({
  desde,
  hasta,
}: {
  desde: string;
  hasta: string;
}) {
  const [modo, setModo] = useState<"real" | "demo">("real");
  const [productoId, setProductoId] = useState("");
  const [productos, setProductos] = useState<
    { id: string; nombre: string }[]
  >([]);
  const [vista, setVista] = useState<VistaMapa | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function cambiarModo(valor: "real" | "demo") {
    setModo(valor);
    setProductoId("");
    setProductos([]);
    setVista(null);
    setError("");
  }

  async function consultar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const datos = new FormData(evento.currentTarget);
    setCargando(true);
    setError("");
    setVista(null);

    try {
      let filtro: FiltroMapa = {
        desde,
        hasta,
        horaDesde: Number(datos.get("horaDesde")),
        horaHasta: Number(datos.get("horaHasta")),
        diasAbiertos: datos.getAll("dias").map(Number),
        ...(productoId ? { productoId } : {}),
      };

      if (modo === "demo") {
        const archivoPedidos = datos.get("csvPedidos");
        const archivoLineas = datos.get("csvLineas");

        if (
          !(archivoPedidos instanceof File) ||
          !(archivoLineas instanceof File) ||
          archivoPedidos.size === 0 ||
          archivoLineas.size === 0
        ) {
          throw new Error("Selecciona pedidos.csv y lineas_pedido.csv.");
        }

        if (
          archivoPedidos.size > 5_000_000 ||
          archivoLineas.size > 5_000_000
        ) {
          throw new Error("Cada archivo debe pesar como máximo 5 MB.");
        }

        const [textoPedidos, textoLineas] = await Promise.all([
          archivoPedidos.text(),
          archivoLineas.text(),
        ]);

        const sinteticos = leerPedidosSinteticos(
          textoPedidos,
          textoLineas,
        );

        filtro = {
          ...filtro,
          desde: String(datos.get("demoDesde") || sinteticos.desde),
          hasta: String(datos.get("demoHasta") || sinteticos.hasta),
        };

        const mapa = calcularMapaCalor(sinteticos.pedidos, filtro);

        setProductos(sinteticos.productos);
        setVista({
          mapa,
          desde: filtro.desde,
          hasta: filtro.hasta,
          permiteSugerencias: true,
        });
      } else {
        const respuesta = await consultarMapaCalorAction(filtro);

        if (!respuesta.ok) {
          setError(respuesta.mensaje);
          return;
        }

        setProductos(respuesta.mapa.productos);
        setVista({
          mapa: respuesta.mapa,
          desde: filtro.desde,
          hasta: filtro.hasta,
          // Evitamos recomendar con un periodo aún en curso o futuro.
          permiteSugerencias: filtro.hasta < hoyEnLima(),
        });
      }
    } catch (problema) {
      setError(
        modo === "demo" && problema instanceof Error
          ? problema.message
          : "No pudimos cargar el mapa. Intenta de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <section aria-labelledby="mapa-calor-titulo" className="space-y-4">
      <h2 id="mapa-calor-titulo" className="text-xl font-bold">
        Mapa de calor de pedidos
      </h2>

      <Tarjeta>
        <p className="mb-4 text-sm text-texto-suave">
          Cuenta pedidos no cancelados por día y hora de Lima.
          Cada pedido cuenta una vez, aunque incluya varias unidades del plato.
        </p>

        <label className="grid gap-2 font-medium">
          Fuente de datos
          <select
            value={modo}
            disabled={cargando}
            onChange={(evento) => {
              const valor = evento.target.value;
              if (valor === "real" || valor === "demo") {
                cambiarModo(valor);
              }
            }}
            className={claseCampo}
          >
            <option value="real">Pedidos reales del restaurante</option>
            <option value="demo">Demo con CSV sintéticos</option>
          </select>
        </label>

        <form
          onSubmit={consultar}
          onChange={(evento) => {
            setVista(null);
            setError("");

            const campo = evento.target;

            if (
              campo instanceof HTMLInputElement &&
              (campo.name === "csvPedidos" || campo.name === "csvLineas")
            ) {
              setProductoId("");
              setProductos([]);
            }
          }}
          className="mt-4"
        >
          <fieldset disabled={cargando} className="space-y-4">
            <legend className="sr-only">
              Filtros del mapa de calor
            </legend>

            {modo === "real" ? (
              <p className="text-sm text-texto-suave">
                Periodo: {desde} a {hasta}. Para cambiarlo, usa Desde y
                Hasta en el formulario superior de reportes.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 font-medium">
                  pedidos.csv
                  <input
                    type="file"
                    name="csvPedidos"
                    accept=".csv"
                    required
                    className={claseCampo}
                  />
                </label>

                <label className="grid gap-2 font-medium">
                  lineas_pedido.csv
                  <input
                    type="file"
                    name="csvLineas"
                    accept=".csv"
                    required
                    className={claseCampo}
                  />
                </label>

                <label className="grid gap-2 font-medium">
                  Desde en la demo (opcional)
                  <input
                    type="date"
                    name="demoDesde"
                    className={claseCampo}
                  />
                </label>

                <label className="grid gap-2 font-medium">
                  Hasta en la demo (opcional)
                  <input
                    type="date"
                    name="demoHasta"
                    className={claseCampo}
                  />
                </label>

                <p className="text-sm text-texto-suave sm:col-span-2">
                  Si no indicas fechas, se usa todo el periodo de los CSV.
                  Los archivos se procesan en este navegador y no se
                  envían a la base de datos.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 font-medium">
                Desde la hora
                <input
                  type="number"
                  name="horaDesde"
                  min={0}
                  max={23}
                  step={1}
                  defaultValue={11}
                  required
                  className={claseCampo}
                />
              </label>

              <label className="grid gap-2 font-medium">
                Hasta la hora (sin incluir)
                <input
                  type="number"
                  name="horaHasta"
                  min={1}
                  max={24}
                  step={1}
                  defaultValue={22}
                  required
                  className={claseCampo}
                />
              </label>

              <label className="grid gap-2 font-medium">
                Plato
                <select
                  value={productoId}
                  onChange={(evento) => setProductoId(evento.target.value)}
                  className={claseCampo}
                >
                  <option value="">Todos los platos</option>
                  {productos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {productos.length === 0 && (
              <p className="text-sm text-texto-suave">
                Primero consulta todos los platos para cargar el selector.
              </p>
            )}

            <fieldset>
              <legend className="font-medium">Días de atención</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {DIAS_MAPA.map((dia, indice) => (
                  <label
                    key={dia}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3"
                  >
                    <input
                      type="checkbox"
                      name="dias"
                      value={indice}
                      defaultChecked
                      className="size-4"
                    />
                    {dia}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                required
                className="size-4 shrink-0"
              />
              Confirmo que los días y horas seleccionados corresponden
              al horario de atención del periodo.
            </label>

            <Boton type="submit" disabled={cargando}>
              {cargando ? "Consultando…" : "Consultar mapa"}
            </Boton>
          </fieldset>
        </form>

        <p className="mt-3 text-sm text-texto-suave">
          El horario inicial 11:00–22:00 corresponde a la demo de US-074.
          Ajústalo antes de consultar los datos reales.
        </p>
      </Tarjeta>

      {cargando && (
        <p role="status" aria-live="polite">
          Cargando el mapa…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-borde p-4 text-red-700"
        >
          {error}
        </p>
      )}

      {vista && (
        <ResultadoMapa
          vista={vista}
          esDemo={modo === "demo"}
        />
      )}
    </section>
  );
}

function ResultadoMapa({
  vista,
  esDemo,
}: {
  vista: VistaMapa;
  esDemo: boolean;
}) {
  const { mapa, permiteSugerencias } = vista;
  const horas = [...new Set(mapa.celdas.map((celda) => celda.hora))];
  const maximo = Math.max(0, ...mapa.celdas.map((celda) => celda.promedio));
  const porClave = new Map(
    mapa.celdas.map((celda) => [`${celda.dia}:${celda.hora}`, celda]),
  );
  const sugerencias = permiteSugerencias ? mapa.sugerencias : [];

  return (
    <Tarjeta>
      <h3 className="text-lg font-bold">
        {esDemo ? "Resultado de la demo" : "Resultado del restaurante"}
      </h3>

      <p className="mt-2 text-sm">
        {vista.desde} a {vista.hasta} · {mapa.totalPedidos} pedidos
        en el horario y plato seleccionados.
      </p>

      {mapa.totalPedidos === 0 && (
        <p role="status" className="mt-4 text-texto-suave">
          No hay pedidos para estos filtros.
        </p>
      )}

      <div
        role="region"
        aria-label="Tabla del mapa de calor, desplazable horizontalmente"
        tabIndex={0}
        className="mt-4 overflow-x-auto rounded-lg border border-borde"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Cantidad de pedidos por día y hora. El color representa
            el promedio de pedidos por fecha comparable.
          </caption>

          <thead>
            <tr>
              <th scope="col" className="p-3 text-left">Día</th>
              {horas.map((hora) => (
                <th key={hora} scope="col" className="min-w-20 p-3">
                  {String(hora).padStart(2, "0")}:00
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {DIAS_MAPA.map((dia, indice) => (
              <tr key={dia}>
                <th scope="row" className="p-3 text-left font-medium">
                  {dia}
                </th>

                {horas.map((hora) => {
                  const celda = porClave.get(`${indice}:${hora}`)!;
                  const baja = permiteSugerencias && celda.bajaDemanda;
                  const proporcion = maximo === 0
                    ? 0
                    : celda.promedio / maximo;

                  const color = celda.diasEnRango === 0
                    ? "bg-superficie text-texto-suave"
                    : proporcion > 0.66
                      ? "bg-teal-800 text-white"
                      : proporcion > 0.33
                        ? "bg-teal-200 text-slate-950"
                        : "bg-teal-50 text-slate-950";

                  return (
                    <td
                      key={hora}
                      className={`border border-borde p-3 text-center ${color} ${
                        baja ? "ring-2 ring-inset ring-amber-500" : ""
                      }`}
                    >
                      {celda.diasEnRango === 0 ? (
                        <span aria-label="Sin fechas de atención en el rango">
                          —
                        </span>
                      ) : (
                        <>
                          <span className="block font-semibold">
                            {celda.pedidos}
                          </span>
                          <span className="block text-xs">
                            {celda.promedio.toFixed(2)} por fecha
                          </span>
                          {baja && (
                            <span className="mt-1 block text-xs font-bold">
                              Baja demanda
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-lg font-bold">
        Promociones sugeridas
      </h3>

      {!permiteSugerencias ? (
        <p className="mt-2 text-sm text-texto-suave">
          Consulta un periodo terminado antes de hoy para generar
          sugerencias. El día actual y las fechas futuras pueden
          distorsionar la comparación.
        </p>
      ) : sugerencias.length > 0 ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {sugerencias.map((sugerencia) => (
            <li key={`${sugerencia.dia}:${sugerencia.hora}`}>
              {sugerencia.texto}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-texto-suave">
          No hay franjas que cumplan las condiciones para sugerir una promoción.
          Se necesitan al menos dos fechas comparables por día de la semana.
        </p>
      )}

      <p className="mt-4 text-sm text-texto-suave">
        Una franja se marca como baja demanda cuando su promedio es menor
        o igual a la mitad de la media de las franjas comparables.
        Los ceros se incluyen en el cálculo.
      </p>

      <p className="mt-2 text-sm text-texto-suave">
        Revisa el horario de atención y la disponibilidad del plato antes
        de aplicar la promoción. Pocos pedidos registrados no demuestran
        por sí solos falta de demanda.
      </p>
    </Tarjeta>
  );
}