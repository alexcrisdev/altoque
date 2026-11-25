import { Suspense } from "react";
import {
  Boton,
  BotonEnlace,
  EncabezadoPantalla,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { requerirRol } from "@/features/auth/sesion";
import {
  consultarVentasAction,
  consultarTendenciasAction,
  consultarTiemposCocinaAction,
} from "@/features/dashboard/actions";
import { consultarPrediccionMananaAction } from "@/features/dashboard/prediccion-actions";
import { TarjetaPrediccion } from "@/features/dashboard/tarjeta-prediccion";
import { MapaCalorPanel } from "@/features/dashboard/mapa-calor-panel";
import { ReportesSecciones } from "@/features/dashboard/reportes-secciones";
import { ESTADOS_TENDENCIAS } from "@/features/dashboard/tendencias-logica";
import { MINIMO_PEDIDOS_PARA_COMPARAR } from "@/features/dashboard/tiempos-cocina-logica";
import {
  ETIQUETA_ESTADO,
  TONO_ESTADO,
} from "@/features/pedidos/estados";
import {
  ETIQUETA_METODO,
  type MetodoPago,
} from "@/features/pago-cierre/cuenta-logica";
import { formatearPrecio } from "@/features/carta/formato";

type Props = PageProps<"/admin/reportes">;

const METODOS: MetodoPago[] = ["CASH", "YAPE", "CARD"];

function fechaActualLima(): string {
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

export default function PaginaReportes({ searchParams }: Props) {
  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando reporte de ventas..."
          />
        }
      >
        <ContenidoReportes searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContenidoReportes({
  searchParams,
}: Pick<Props, "searchParams">) {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresiaReporte = sesion.membresias.find((m) => m.rol === "OWNER")
    ?? sesion.membresias.find((m) => m.rol === "ADMIN");
  const esOwner = membresiaReporte?.rol === "OWNER";

  const parametros = await searchParams;
  const hoy = fechaActualLima();

  // Solo la ausencia del parámetro usa hoy.
  // Valores vacíos o repetidos pasan como inválidos.
  const desde = parametros.desde === undefined
    ? hoy
    : typeof parametros.desde === "string"
      ? parametros.desde
      : "";

  const hasta = parametros.hasta === undefined
    ? hoy
    : typeof parametros.hasta === "string"
      ? parametros.hasta
      : "";

  // Los reportes usan el rango; la predicción siempre corresponde a mañana en Lima.
  const [resultado, resultadoTendencias, resultadoTiempos, resultadoPrediccion] = await Promise.all([
    consultarVentasAction(desde, hasta),
    consultarTendenciasAction(desde, hasta),
    consultarTiemposCocinaAction(desde, hasta),
    consultarPrediccionMananaAction(),
  ]);

  const claseCampo =
    "min-h-11 w-full rounded-xl border border-borde " +
    "bg-superficie px-3 py-2 text-texto " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-marca";

  return (
    <div className="space-y-6">
      <BotonEnlace href="/admin" variante="fantasma">
        Volver a administración
      </BotonEnlace>

      <EncabezadoPantalla
        titulo="Reportes de ventas"
        subtitulo="Ventas confirmadas y ticket promedio del restaurante."
      />

      <Tarjeta>
        <form
          action="/admin/reportes"
          method="get"
          className="grid gap-4 sm:grid-cols-3 sm:items-end"
        >
          <label className="grid gap-2 font-medium">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              required
              className={claseCampo}
            />
          </label>

          <label className="grid gap-2 font-medium">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              required
              className={claseCampo}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Boton type="submit">Consultar</Boton>
            {esOwner && (
              <BotonEnlace
                href={`/api/admin/reportes/ventas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`}
                variante="secundario"
              >
                Descargar CSV
              </BotonEnlace>
            )}
          </div>
        </form>

        <p className="mt-3 text-sm text-texto-suave">
          Fechas en hora de Lima (UTC-5). Se incluye todo el día
          seleccionado en Hasta.
        </p>
      </Tarjeta>

      <ReportesSecciones
        ventas={<>
      {!resultado.ok ? (
        <MensajeEstado
          tipo="error"
          titulo="No pudimos mostrar el reporte"
          descripcion={resultado.mensaje}
        />
      ) : (
        <>
          <section
            aria-label="Indicadores de ventas"
            className="grid gap-4 sm:grid-cols-3"
          >
            <Indicador
              titulo="Ventas confirmadas"
              valor={formatearPrecio(
                resultado.resumen.ventasCentimos / 100,
              )}
            />

            <Indicador
              titulo="Cuentas pagadas"
              valor={String(resultado.resumen.cuentasPagadas)}
            />

            <Indicador
              titulo="Ticket promedio"
              valor={formatearPrecio(
                resultado.resumen.ticketPromedioCentimos / 100,
              )}
            />
          </section>

          {resultado.resumen.cuentasPagadas === 0 && (
            <MensajeEstado
              tipo="vacio"
              titulo="No hay ventas confirmadas en este rango"
              descripcion="Los pagos pendientes o fallidos no se incluyen."
            />
          )}

          <section aria-labelledby="desglose-metodos">
            <Tarjeta>
              <h2
                id="desglose-metodos"
                className="text-lg font-bold"
              >
                Ventas por método de pago
              </h2>

              <dl className="mt-4 divide-y divide-borde">
                {METODOS.map((metodo) => (
                  <div
                    key={metodo}
                    className="flex justify-between gap-4 py-3"
                  >
                    <dt>{ETIQUETA_METODO[metodo]}</dt>
                    <dd className="font-semibold">
                      {formatearPrecio(
                        resultado.resumen.porMetodo[metodo] / 100,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Tarjeta>
          </section>
        </>
      )}

      <Tarjeta>
        <details><summary className="min-h-11 py-2 text-sm font-semibold text-marca"><h2 className="inline text-base font-semibold">
          Cómo se calculan los indicadores
        </h2></summary>

        <div className="mt-3 space-y-3 text-sm text-texto-suave">
          <p>
            Ventas: suma de los montos de pagos confirmados cuya
            fecha de confirmación está dentro del rango. No se
            incluyen pedidos sin cobrar ni pagos pendientes o fallidos.
          </p>

          <p>
            Cuentas pagadas: sesiones de mesa o pedidos para llevar
            distintos con al menos un pago confirmado en el rango.
            Los pagos parciales o combinados de una misma cuenta
            cuentan una sola vez. Esto no implica que su saldo sea cero.
          </p>

          <p className="font-semibold text-texto">
            Ticket promedio = ventas confirmadas ÷ cuentas pagadas.
          </p>

          <p>
            Sin cuentas pagadas, el ticket es S/ 0.00. Los cálculos
            usan céntimos y el promedio se redondea al céntimo más cercano.
          </p>
        </div>
        </details>
      </Tarjeta>

        </>}
        tendencias={<>
      <TarjetaPrediccion resultado={resultadoPrediccion} />
      <section
        aria-labelledby="tendencias-titulo"
        className="space-y-4"
      >
        <h2
          id="tendencias-titulo"
          className="text-xl font-bold"
        >
          Tendencias de pedidos
        </h2>

        {!resultadoTendencias.ok ? (
          <MensajeEstado
            tipo="error"
            titulo="No pudimos mostrar las tendencias"
            descripcion={resultadoTendencias.mensaje}
          />
        ) : (
          <>
            {resultadoTendencias.tendencias.total === 0 && (
              <MensajeEstado
                tipo="vacio"
                titulo="No hay pedidos en este rango"
                descripcion="Selecciona otro periodo para consultar las tendencias."
              />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-labelledby="productos-mas-vendidos">
                <Tarjeta className="h-full">
                  <h3
                    id="productos-mas-vendidos"
                    className="text-lg font-bold"
                  >
                    Productos más vendidos
                  </h3>

                  <p className="mt-1 text-sm text-texto-suave">
                    Los cinco productos con más unidades de pedidos
                    no cancelados.
                  </p>

                  {resultadoTendencias.tendencias.productos.length === 0 ? (
                    <div className="mt-4">
                      <MensajeEstado
                        tipo="vacio"
                        titulo="No hay productos para mostrar"
                        descripcion="El ranking excluye los pedidos cancelados."
                      />
                    </div>
                  ) : (
                    <ol className="mt-4 list-decimal space-y-3 pl-6">
                      {resultadoTendencias.tendencias.productos.map(
                        (producto) => (
                          <li
                            key={producto.productId}
                            className="pl-1 marker:font-semibold marker:text-marca"
                          >
                            <div className="flex items-start justify-between gap-4 border-b border-borde pb-3">
                              <span className="min-w-0 break-words font-medium">
                                {producto.nombre}
                              </span>

                              <span className="shrink-0 text-sm font-semibold">
                                {producto.unidades}{" "}
                                {producto.unidades === 1
                                  ? "unidad"
                                  : "unidades"}
                              </span>
                            </div>
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                </Tarjeta>
              </section>

              <section aria-labelledby="pedidos-por-estado">
                <Tarjeta className="h-full">
                  <h3
                    id="pedidos-por-estado"
                    className="text-lg font-bold"
                  >
                    Pedidos por estado
                  </h3>

                  <p className="mt-2 font-semibold">
                    Total de pedidos:{" "}
                    {resultadoTendencias.tendencias.total}
                  </p>

                  <dl className="mt-4 divide-y divide-borde">
                    {ESTADOS_TENDENCIAS.map((estado) => (
                      <div
                        key={estado}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <dt>
                          <Insignia tono={TONO_ESTADO[estado]}>
                            {ETIQUETA_ESTADO[estado]}
                          </Insignia>
                        </dt>

                        <dd className="font-semibold">
                          {resultadoTendencias.tendencias.porEstado[estado]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Tarjeta>
              </section>
            </div>
          </>
        )}

        <Tarjeta>
          <details><summary className="min-h-11 py-2 text-sm font-semibold text-marca"><h3 className="inline text-base font-semibold">
            Cómo se calculan las tendencias
          </h3></summary>

          <div className="mt-3 space-y-3 text-sm text-texto-suave">
            <p>
              El periodo usa la fecha de creación del pedido en hora
              de Lima. Se incluyen los pedidos creados desde las 00:00
              de Desde hasta antes de las 00:00 del día siguiente a Hasta.
            </p>

            <p>
              Productos más vendidos: suma de las cantidades actuales
              registradas en los pedidos no cancelados, agrupadas por
              identificador del producto. No depende de que el pedido
              esté pagado.
            </p>

            <p>
              Se muestran hasta cinco productos, ordenados por unidades
              de mayor a menor. Los empates se resuelven alfabéticamente.
              El nombre corresponde al pedido no cancelado más reciente.
            </p>

            <p>
              Pedidos por estado: cada pedido cuenta una sola vez según
              su estado actual. El total incluye cancelados y los seis
              estados se muestran incluso cuando tienen cero pedidos.
            </p>

            <p>
              Las ventas usan la fecha de confirmación del pago; las
              tendencias usan la fecha de creación del pedido. Por eso
              sus cantidades no tienen que coincidir.
            </p>
          </div>
          </details>
        </Tarjeta>
      </section>

        </>}
        mapaCalor={<MapaCalorPanel
        key={`${desde}:${hasta}`}
        desde={desde}
        hasta={hasta}
        />}

        cocina={<section aria-labelledby="tiempos-cocina-titulo" className="space-y-4">
        <h2 id="tiempos-cocina-titulo" className="text-xl font-bold">
          Tiempos por etapa
        </h2>
        <p className="text-sm text-texto-suave">
          El rango toma la hora de inicio de cada etapa en Lima. La mediana es el tiempo central
          y el P90 es el tiempo en el que terminó al menos el 90 % de los pedidos medidos.
        </p>
        {!resultadoTiempos.ok ? (
          <MensajeEstado tipo="error" titulo="No pudimos mostrar los tiempos por etapa"
            descripcion={resultadoTiempos.mensaje} />
        ) : !resultadoTiempos.resumen.etapas ? (
          <MensajeEstado tipo="vacio" titulo="No hay tiempos por etapa en este rango" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ["Espera de pago", "Hasta que el pago habilita la preparación.", resultadoTiempos.resumen.etapas.pago],
                ["Preparación", "Desde el primer ingreso a cocina hasta el último Listo.", resultadoTiempos.resumen.etapas.preparacion],
                ["Entrega", "Desde el último Listo hasta la entrega.", resultadoTiempos.resumen.etapas.entrega],
              ] as const).map(([titulo, descripcion, etapa]) => (
                <Tarjeta key={titulo}>
                  <h3 className="font-bold">{titulo}</h3>
                  <p className="mt-1 text-sm text-texto-suave">{descripcion}</p>
                  <p className="mt-3 text-sm tabular-nums">Pedidos medidos: {etapa.pedidos}</p>
                  {etapa.pedidos < MINIMO_PEDIDOS_PARA_COMPARAR || etapa.medianaMs === null || etapa.p90Ms === null ? (
                    <p className="mt-2 text-sm text-texto-suave">
                      Datos insuficientes. Se necesitan {MINIMO_PEDIDOS_PARA_COMPARAR} pedidos medidos.
                    </p>
                  ) : (
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
                      <div>
                        <dt className="text-texto-suave">Mediana</dt>
                        <dd className="font-bold">{minutosCocina(etapa.medianaMs)}</dd>
                      </div>
                      <div>
                        <dt className="text-texto-suave">P90</dt>
                        <dd className="font-bold">{minutosCocina(etapa.p90Ms)}</dd>
                      </div>
                    </dl>
                  )}
                </Tarjeta>
              ))}
            </div>

            <Tarjeta>
              <h3 id="tiempos-cocina-platos" className="text-lg font-bold">Pedidos que incluyen este plato</h3>
              <p className="mt-1 text-sm text-texto-suave">
                Se mide la preparación del pedido completo. Cada plato cuenta una vez por pedido.
                Los platos con suficientes datos se ordenan de mayor a menor mediana.
              </p>
              {resultadoTiempos.resumen.etapas.porPlato.length === 0 ? (
                <p className="mt-3 text-sm text-texto-suave">No hay pedidos con preparación medida en este rango.</p>
              ) : (
                <div role="region" aria-labelledby="tiempos-cocina-platos" tabIndex={0} className="tabla-gestion mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr>
                      <th scope="col" className="p-2">Plato</th>
                      <th scope="col" className="p-2">Pedidos medidos</th>
                      <th scope="col" className="p-2">Mediana</th>
                      <th scope="col" className="p-2">P90</th>
                    </tr></thead>
                    <tbody>{resultadoTiempos.resumen.etapas.porPlato.toSorted((a, b) => {
                      const aSuficiente = a.pedidos >= MINIMO_PEDIDOS_PARA_COMPARAR;
                      const bSuficiente = b.pedidos >= MINIMO_PEDIDOS_PARA_COMPARAR;
                      if (!aSuficiente && !bSuficiente) return a.nombre.localeCompare(b.nombre, "es");
                      return Number(bSuficiente) - Number(aSuficiente);
                    }).map((fila) => (
                      <tr key={fila.nombre} className="border-t border-borde">
                        <th scope="row" className="p-2 font-medium">{fila.nombre}</th>
                        <td className="p-2 tabular-nums">{fila.pedidos}</td>
                        {fila.pedidos < MINIMO_PEDIDOS_PARA_COMPARAR || fila.medianaMs === null || fila.p90Ms === null ? (
                          <td colSpan={2} className="p-2 text-texto-suave">Datos insuficientes</td>
                        ) : (
                          <>
                            <td className="p-2 tabular-nums">{minutosCocina(fila.medianaMs)}</td>
                            <td className="p-2 tabular-nums">{minutosCocina(fila.p90Ms)}</td>
                          </>
                        )}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Tarjeta>

            {([
              ["Preparación por día", resultadoTiempos.resumen.porDia],
              ["Preparación por franja horaria", resultadoTiempos.resumen.porFranja],
            ] as const).map(([titulo, filas]) => filas.length > 0 && (
              <Tarjeta key={titulo}>
                <div role="region" aria-label={titulo} tabIndex={0} className="tabla-gestion overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="pb-3 text-left text-lg font-bold">{titulo}</caption>
                    <thead><tr>
                      <th scope="col" className="p-2">Grupo</th>
                      <th scope="col" className="p-2">Pedidos</th>
                      <th scope="col" className="p-2">Promedio</th>
                      <th scope="col" className="p-2">Máximo</th>
                    </tr></thead>
                    <tbody>{filas.map((fila) => (
                      <tr key={fila.nombre} className="border-t border-borde">
                        <th scope="row" className="p-2 font-medium">{fila.nombre}</th>
                        <td className="p-2">{fila.pedidos}</td>
                        {fila.pedidos < MINIMO_PEDIDOS_PARA_COMPARAR ? (
                          <td colSpan={2} className="p-2 text-texto-suave">Datos insuficientes</td>
                        ) : (
                          <>
                            <td className="p-2">{minutosCocina(fila.promedioMs)}</td>
                            <td className="p-2">{minutosCocina(fila.maximoMs)}</td>
                          </>
                        )}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Tarjeta>
            ))}
          </>
        )}
        </section>}
      />
    </div>
  );
}

function minutosCocina(ms: number): string {
  return `${(ms / 60000).toLocaleString("es-PE", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })} min`;
}

function Indicador({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <Tarjeta className="indicador-gestion">
      <h2 className="text-sm font-medium text-texto-suave">
        {titulo}
      </h2>
      <p className="mt-2 break-words text-2xl font-bold">
        {valor}
      </p>
    </Tarjeta>
  );
}
