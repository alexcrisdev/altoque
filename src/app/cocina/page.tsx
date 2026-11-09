import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { Boton, clasesBoton, EncabezadoPantalla, Insignia, MensajeEstado, Tarjeta } from "@/components/ui";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import { obtenerPanelCocina } from "@/features/cocina/actions";
import { ContenidoConservado } from "@/features/cocina/contenido-conservado";
import { AvisosCocina } from "@/features/cocina/avisos-cocina";
import { BotonAvanzarEstado } from "@/features/cocina/boton-avanzar-estado";
import { ReportarIncidencia, MarcarIncidenciaResuelta } from "@/features/cocina/reportar-incidencia";
import { ETIQUETA_TIPO_INCIDENCIA } from "@/features/pedidos/incidencias";
import { agruparPorEstado, filtrarPorEstado, minutosDesde, normalizarFiltro, tieneIncidenciaAbierta, puedeDeshacerListo } from "@/features/cocina/cocina-logica";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "@/features/pedidos/estados";
import { describirDestino } from "@/features/pedidos/modalidad";

const horaLima = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit", minute: "2-digit", timeZone: "America/Lima",
});

async function CocinaPanel({ searchParams }: PageProps<"/cocina">) {
  // obtenerPanelCocina exige KITCHEN, OWNER o ADMIN antes de consultar.
  const resultado = await obtenerPanelCocina();
  const filtro = normalizarFiltro((await searchParams).estado);
  const pedidos = resultado.ok ? resultado.pedidos : [];
  const grupos = agruparPorEstado(pedidos);
  const visibles = filtrarPorEstado(pedidos, filtro);
  const ahora = resultado.ok ? resultado.actualizadoEn : null;

  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <EncabezadoPantalla titulo="Cocina" subtitulo="Prepara los pedidos en orden de llegada."
      acciones={<form action={cerrarSesion}><Boton variante="secundario" type="submit">Cerrar sesión</Boton></form>} />
    <AvisosCocina><ActualizacionAutomatica />
    <ContenidoConservado key={`${resultado.restauranteId}:${filtro}`} actualizadoEn={ahora} error={!resultado.ok}>
      {!resultado.ok ? <MensajeEstado tipo="error" titulo="No pudimos cargar los pedidos"
        descripcion="Revisa tu conexión. Volveremos a intentarlo automáticamente." /> : <>
        <nav aria-label="Filtrar pedidos por estado" className="mb-6 flex flex-wrap gap-2">
          {["TODOS", "IN_PROGRESS", "READY"].map((estado) => {
            const etiqueta = estado === "TODOS" ? "Todos"
              : estado === "READY" ? "Listos" : ETIQUETA_ESTADO.IN_PROGRESS;
            const cantidad = estado === "TODOS" ? pedidos.length : grupos[estado as keyof typeof grupos].length;
            return <a key={estado} href={estado === "TODOS" ? "/cocina" : `/cocina?estado=${estado}`}
              className={clasesBoton(filtro === estado ? "primario" : "secundario")} aria-current={filtro === estado ? "page" : undefined}>
              {etiqueta} ({cantidad})
            </a>;
          })}
        </nav>
        {visibles.length === 0 ? <MensajeEstado tipo="vacio" titulo="No hay pedidos pendientes" /> :
          <ul className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Pedidos de cocina">
            {visibles.map((pedido) => <li key={pedido.id}>
              <Tarjeta className={tieneIncidenciaAbierta(pedido) ? "border-2 border-aviso-borde! bg-aviso-fondo!" : pedido.estado === "PENDING" ? "border-2 border-aviso-texto" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-xl font-bold">N.º {pedido.numero}</h2>
                  <div className="flex flex-wrap gap-2">
                    {tieneIncidenciaAbierta(pedido) && <Insignia tono="aviso">⚠️ Incidencia</Insignia>}
                    {pedido.estado === "PENDING" && <Insignia tono="aviso">Nuevo</Insignia>}
                    <Insignia tono={TONO_ESTADO[pedido.estado]}>{ETIQUETA_ESTADO[pedido.estado]}</Insignia>
                  </div>
                </div>
                <p className="mt-2 text-sm text-texto-suave">
                  <time dateTime={pedido.creadoEn}>{horaLima.format(new Date(pedido.creadoEn))}</time>
                  {` · hace ${minutosDesde(pedido.creadoEn, ahora!)} min`}
                </p>
                <p className="mt-3 break-words font-semibold">{describirDestino({
                  modalidad: pedido.modalidad, mesaNumero: pedido.mesaNumero, nombre: pedido.nombreCliente, telefono: null,
                })}</p>
                <p className="mt-1 text-sm text-texto-suave">{pedido.asistido ? "Registrado por mesero" : "Desde QR"}</p>
                <ul className="mt-4 space-y-3">
                  {pedido.items.map((item, indice) => <li key={indice} className="break-words">
                    <p className="font-medium">{item.cantidad} × {item.nombre}</p>
                    {item.observacion && <p className="mt-1 rounded-lg bg-aviso-fondo p-2 text-sm font-semibold text-aviso-texto">
                      Observación: {item.observacion}
                    </p>}
                  </li>)}
                </ul>
                {tieneIncidenciaAbierta(pedido) && <section className="mt-4 space-y-3" aria-label={`Incidencias abiertas del pedido N.º ${pedido.numero}`}>
                  {pedido.incidenciasAbiertas.map((incidencia) => <div key={incidencia.id} className="rounded-xl border border-aviso-borde p-3">
                    <p className="font-semibold">{ETIQUETA_TIPO_INCIDENCIA[incidencia.tipo]}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{incidencia.descripcion}</p>
                    <p className="mt-1 text-sm text-texto-suave"><time dateTime={incidencia.creadaEn}>{horaLima.format(new Date(incidencia.creadaEn))}</time></p>
                    <MarcarIncidenciaResuelta pedidoId={pedido.id} incidenciaId={incidencia.id} descripcion={incidencia.descripcion} />
                  </div>)}
                </section>}
                {pedido.estado === "READY" && <p className="mt-4 text-sm font-semibold text-texto-suave">Esperando al mesero</p>}
                {(pedido.estado !== "READY" || puedeDeshacerListo(pedido.listoEn, ahora!)) &&
                  <BotonAvanzarEstado key={`${pedido.id}:${pedido.estado}`} pedidoId={pedido.id} estado={pedido.estado} numero={pedido.numero} />}
                <ReportarIncidencia pedidoId={pedido.id} estado={pedido.estado} numero={pedido.numero} />
              </Tarjeta>
            </li>)}
          </ul>}
      </>}
    </ContenidoConservado></AvisosCocina>
  </main>;
}

export default function CocinaPage(props: PageProps<"/cocina">) {
  return <Suspense fallback={<main className="mx-auto max-w-7xl p-6">
    <MensajeEstado tipo="cargando" titulo="Cargando cocina…" />
  </main>}><CocinaPanel {...props} /></Suspense>;
}
