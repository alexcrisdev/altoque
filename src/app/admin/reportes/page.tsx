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
} from "@/features/dashboard/actions";
import { MapaCalorPanel } from "@/features/dashboard/mapa-calor-panel";
import { ESTADOS_TENDENCIAS } from "@/features/dashboard/tendencias-logica";
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
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
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

  // Ambas consultas usan las mismas fechas y resultados independientes.
  const [resultado, resultadoTendencias] = await Promise.all([
    consultarVentasAction(desde, hasta),
    consultarTendenciasAction(desde, hasta),
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
        <h2 className="text-lg font-bold">
          Cómo se calculan los indicadores
        </h2>

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
      </Tarjeta>

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
          <h3 className="text-lg font-bold">
            Cómo se calculan las tendencias
          </h3>

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
        </Tarjeta>
      </section>

      <MapaCalorPanel
        key={`${desde}:${hasta}`}
        desde={desde}
        hasta={hasta}
      />
    </div>
  );
}

function Indicador({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <Tarjeta>
      <h2 className="text-sm font-medium text-texto-suave">
        {titulo}
      </h2>
      <p className="mt-2 break-words text-2xl font-bold">
        {valor}
      </p>
    </Tarjeta>
  );
}
