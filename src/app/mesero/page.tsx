import { AvisoAlergia } from "../../features/pedidos/aviso-alergia";
import { Suspense } from "react";
import { Boton, BotonEnlace, EncabezadoPantalla, Insignia, MensajeEstado, Tarjeta } from "@/components/ui";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import { ContenidoConservado } from "@/features/cocina/contenido-conservado";
import { AlertasMesero } from "@/features/mesero/alertas-mesero";
import { textoAntiguedad } from "@/features/mesero/alertas-logica";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirPanel } from "@/features/auth/sesion";
import { obtenerPanelMesero } from "@/features/mesero/panel-actions";
import { agruparPorMesa, GRUPO_PARA_LLEVAR, minutosDesde, pedidosQueRequierenAtencion, resumenMesa } from "@/features/mesero/panel-logica";
import type { PedidoActivo } from "@/features/mesero/pedidos-activos";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "@/features/pedidos/estados";
import { TEXTO_LIBERACION } from "@/features/mesero/liberacion-logica";
import { BotonAbrirSesion, BotonCerrarSesion } from "./acciones-sesion";

const horaLima = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit", minute: "2-digit", timeZone: "America/Lima",
});

function DatosPedido({ pedido, ahora }: { pedido: PedidoActivo; ahora: string }) {
  const destino = pedido.modalidad === "TAKEAWAY"
    ? `Para llevar${pedido.nombreCliente ? ` · ${pedido.nombreCliente}` : ""}`
    : `Mesa ${pedido.mesaNumero ?? "sin identificar"}`;

  return <div className="mesero-pedido space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="break-words font-semibold">N.º {pedido.numero} · {destino}</h3>
      <Insignia tono={TONO_ESTADO[pedido.estado]}>{ETIQUETA_ESTADO[pedido.estado]}</Insignia>
    </div>
    <p className="text-sm text-texto-suave">
      <time dateTime={pedido.creadoEn}>{horaLima.format(new Date(pedido.creadoEn))}</time>
      {` · ${textoAntiguedad(minutosDesde(pedido.creadoEn, ahora))}`}
      {pedido.asistido ? " · Registrado por mesero" : " · Desde QR"}
    </p>
    <AvisoAlergia alergia={pedido.alergia} cocina />
    {pedido.estado === "READY" && <p className="font-bold text-exito-texto">Listo para entregar</p>}
    <BotonEnlace href={`/mesero/pedidos/${pedido.id}`} variante="secundario" aria-label={`Ver pedido N.º ${pedido.numero}`}>
      Ver pedido
    </BotonEnlace>
  </div>;
}

async function MeseroPanel() {
  await requerirPanel("mesero"); // US-106
  const resultado = await obtenerPanelMesero();
  const mesas = resultado.ok ? resultado.mesas : [];
  const pedidos = resultado.ok ? resultado.pedidos : [];
  const grupos = agruparPorMesa(pedidos);
  const ahora = resultado.ok ? resultado.actualizadoEn : "";
  const liberacion = resultado.ok ? resultado.liberacion : {};
  const requierenAtencion = pedidosQueRequierenAtencion(pedidos, ahora);
  const paraLlevar = grupos.get(GRUPO_PARA_LLEVAR) ?? [];

  return <main id="contenido-principal" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <EncabezadoPantalla titulo="Panel mesero" subtitulo="Organiza la atención de mesas y pedidos activos."
      acciones={<form action={cerrarSesion}><Boton type="submit" variante="secundario" className="boton-cerrar-sesion">Cerrar sesión</Boton></form>} />
    <ActualizacionAutomatica segundos={10} />
    <div className="mesero-acciones my-5 flex flex-wrap gap-3 rounded-2xl border border-borde bg-superficie p-4">
      <BotonEnlace href="/mesero/pedido">Registrar pedido asistido</BotonEnlace>
      <BotonEnlace href="/mesero" variante="secundario">Actualizar panel</BotonEnlace>
    </div>

    <AlertasMesero key={`alertas-${resultado.restauranteId}`}
      restauranteId={resultado.restauranteId}
      mesas={mesas.map(({ id, numero }) => ({ id, numero }))}
      pedidos={resultado.ok ? pedidos : null}
      solicitudes={resultado.ok ? resultado.solicitudes : null}
      actualizadoEn={resultado.ok ? resultado.actualizadoEn : null}
      errorSolicitudes={!resultado.ok || resultado.errorSolicitudes}
      error={!resultado.ok} />

    <ContenidoConservado key={`contenido-${resultado.restauranteId}`}
      actualizadoEn={resultado.ok ? resultado.actualizadoEn : null} error={!resultado.ok}>
    {!resultado.ok ? <div className="mt-6"><MensajeEstado tipo="error" titulo="No pudimos cargar las mesas y los pedidos"
      descripcion="Revisa tu conexión. Volveremos a intentarlo automáticamente cada 10 segundos o puedes actualizar el panel." /></div> : <>
      <section aria-labelledby="mesero-atencion" className="mt-8">
        <h2 id="mesero-atencion" className="mb-4 text-xl font-semibold">Requieren atención</h2>
        <details className="ayuda-discreta mb-2">
          <summary>Orden de atención</summary>
          <p className="pb-2 text-sm text-texto-suave">Primero los listos para entregar, luego los pendientes de aceptar con más de 5 minutos.</p>
        </details>
        {requierenAtencion.length === 0 ? <MensajeEstado tipo="vacio" titulo="Todo al día" /> :
          <ul className="grid gap-3 md:grid-cols-2">{requierenAtencion.map((pedido) =>
            <li key={pedido.id}><Tarjeta tono={pedido.estado === "READY" ? "exito" : "neutro"} relleno={pedido.estado === "READY" ? "amplio" : "normal"} className={pedido.estado === "READY" ? "border-2 text-lg shadow-sm" : ""}>
              <DatosPedido pedido={pedido} ahora={ahora} />
            </Tarjeta></li>)}
          </ul>}
      </section>

      <section aria-labelledby="mesero-mesas" className="mt-8">
        <h2 id="mesero-mesas" className="mb-4 text-xl font-semibold">Mesas</h2>
        {mesas.length === 0 ? <MensajeEstado tipo="vacio" titulo="No hay mesas activas en este restaurante." /> :
          <ul className="mesero-cuadricula grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{mesas.map((mesa) => {
            const pedidosMesa = grupos.get(mesa.id) ?? [];
            const resumen = resumenMesa(pedidosMesa);
            return <li key={mesa.id}>
              <Tarjeta tono={resumen.listos > 0 ? "exito" : "neutro"} className={`space-y-4 border-t-4 ${resumen.listos > 0 ? "" : mesa.sesion ? "border-t-aviso-borde" : "border-t-exito-borde"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold tabular-nums">Mesa {mesa.numero}</h3>
                  <Insignia tono={mesa.sesion ? "aviso" : "exito"}>
                    {mesa.sesion ? `Ocupada desde ${horaLima.format(new Date(mesa.sesion.abiertaDesde))}` : "Libre"}
                  </Insignia>
                </div>
                {(mesa.sesion || pedidosMesa.length > 0) && <>
                  <p className="text-sm font-semibold">
                    {resumen.total} {resumen.total === 1 ? "pedido" : "pedidos"}
                    {resumen.listos > 0 && ` · ${resumen.listos} ${resumen.listos === 1 ? "listo" : "listos"} para entregar`}
                    {resumen.pendientes > 0 && ` · ${resumen.pendientes} ${resumen.pendientes === 1 ? "pendiente" : "pendientes"} de aceptar`}
                  </p>
                  {pedidosMesa.length > 0 ? <ul className="space-y-4 divide-y divide-borde">
                    {pedidosMesa.map((pedido) => <li key={pedido.id} className="pt-3 first:pt-0">
                      <DatosPedido pedido={pedido} ahora={ahora} />
                    </li>)}
                  </ul> : <p className="text-sm text-texto-suave">Sin pedidos activos.</p>}
                </>}
                {mesa.sesion && liberacion[mesa.sesion.id] && <p className="text-sm font-semibold" data-liberacion={liberacion[mesa.sesion.id]}>
                  {TEXTO_LIBERACION[liberacion[mesa.sesion.id]]}
                </p>}
                {mesa.sesion ? <BotonCerrarSesion sesionId={mesa.sesion.id} /> : <BotonAbrirSesion mesaId={mesa.id} />}
              </Tarjeta>
            </li>;
          })}</ul>}
      </section>

      <section aria-labelledby="mesero-para-llevar" className="mt-8">
        <h2 id="mesero-para-llevar" className="mb-4 text-xl font-semibold">Para llevar</h2>
        {paraLlevar.length === 0 ? <MensajeEstado tipo="vacio" titulo="No hay pedidos activos para llevar." /> :
          <ul className="grid gap-3 md:grid-cols-2">{paraLlevar.map((pedido) =>
            <li key={pedido.id}><Tarjeta className={pedido.estado === "READY" ? "border-2 border-exito-borde" : ""}>
              <DatosPedido pedido={pedido} ahora={ahora} />
            </Tarjeta></li>)}
          </ul>}
      </section>
    </>}
    </ContenidoConservado>
  </main>;
}

export default function MeseroPage() {
  return <Suspense fallback={<main id="contenido-principal" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
    <MensajeEstado tipo="cargando" titulo="Cargando panel…" />
  </main>}><MeseroPanel /></Suspense>;
}
