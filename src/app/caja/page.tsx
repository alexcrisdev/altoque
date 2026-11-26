import { PlanoMesas } from "@/features/plano-mesas/plano-mesas";
import { prepararPlano } from "@/features/plano-mesas/preparar-plano";
import { obtenerSalonesCaja } from "@/features/plano-mesas/actions";
import Link from "next/link";
import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirPanel } from "@/features/auth/sesion";
import { formatearPrecio } from "@/features/carta/formato";
import { obtenerPanelCaja } from "@/features/pago-cierre/panel-actions";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import { Boton, EncabezadoPantalla, Insignia, MensajeEstado } from "@/components/ui";
import { PanelCapturas } from "@/features/pago-cierre/panel-capturas";
import { TotalBilletera } from "@/features/pago-cierre/total-billetera";
import { listarDevolucionesPendientes } from "@/features/pago-cierre/devoluciones";
import { DevolucionesPendientes } from "@/features/pago-cierre/devoluciones-vista";

const soles = (centimos: number) => formatearPrecio(centimos / 100);

async function CajaPanel({ searchParams }: Pick<PageProps<"/caja">, "searchParams">) {
  await requerirPanel("caja"); // US-106
  const anterior = (await searchParams).vista === "anterior";
  const { cuentas, mesas, actualizadoEn, restauranteId, puedeVerificar } = await obtenerPanelCaja();
  // US-105: pedidos pagados cancelados por el dueño o el admin, con dinero por devolver.
  const devoluciones = await listarDevolucionesPendientes(restauranteId);
  const salones = anterior ? [] : await obtenerSalonesCaja();
  const mesasOcupadas = mesas.filter((mesa) => mesa.sesion).length;

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <EncabezadoPantalla titulo="Caja" subtitulo="Cobra con claridad y consulta la ocupación del salón."
        acciones={<form action={cerrarSesion}><Boton variante="secundario" type="submit" className="boton-cerrar-sesion">Cerrar sesión</Boton></form>} />
      <ActualizacionAutomatica segundos={10} />
      <div className={`mt-5 grid items-start gap-4 ${puedeVerificar ? "lg:grid-cols-2" : ""}`}>
        {puedeVerificar && <div className="rounded-2xl border border-borde bg-superficie p-5 [&>section]:mt-0"><PanelCapturas restauranteId={restauranteId} /></div>}
        <section aria-label="Cobros por billetera de hoy" className="rounded-2xl border border-info-borde bg-info-fondo p-5 [&>p]:mt-2">
          <h2 className="text-base font-semibold">Cobros confirmados hoy</h2>
          <TotalBilletera restauranteId={restauranteId} />
        </section>
      </div>
      <DevolucionesPendientes devoluciones={devoluciones} />

      <div className="caja-distribucion mt-8 grid items-start gap-6">
      <section aria-labelledby="caja-cuentas" className="min-w-0 rounded-2xl border border-borde bg-superficie p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="caja-cuentas" className="text-xl font-semibold">Cuentas por cobrar o cerrar</h2><Insignia tono="info">{cuentas.length} {cuentas.length === 1 ? "abierta" : "abiertas"}</Insignia></div>
        {cuentas.length === 0 ? (
          <div className="mt-4"><MensajeEstado tipo="vacio" titulo="No hay cuentas abiertas." descripcion="Las cuentas aparecerán aquí cuando se abra una mesa o se registre un pedido para llevar." /></div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {cuentas.map((cuenta) => (
              <li key={cuenta.href}>
                <Link
                  href={cuenta.href}
                  className="cuenta-enlace flex min-h-11 flex-wrap items-center justify-between gap-4 rounded-2xl border border-borde bg-superficie p-5 transition-colors hover:border-marca hover:bg-marca-suave"
                >
                  <span className="min-w-0 flex-1 break-words">
                    <span className="block text-lg font-semibold">{cuenta.titulo}</span>
                    <span className="text-sm text-texto-suave">
                      {cuenta.detalle} · consumo {soles(cuenta.consumoCentimos)}
                    </span>
                    {cuenta.esperaPagoDesde && (
                      <span className="mt-2 block">
                        <Insignia tono="aviso">
                          Esperando pago · hace {Math.max(0, Math.floor((actualizadoEn - Date.parse(cuenta.esperaPagoDesde)) / 60_000))} min
                        </Insignia>
                      </span>
                    )}
                  </span>
                  <span className="text-left sm:text-right">
                    <span className={`block text-xl font-bold tabular-nums ${cuenta.saldoCentimos > 0 ? "mov-saldo text-texto" : "text-exito-texto"}`}>
                      {cuenta.saldoCentimos > 0 ? `Saldo ${soles(cuenta.saldoCentimos)}` : "Pagada · por cerrar"}
                    </span>
                    {cuenta.porVerificar > 0 && (
                      <span className="block text-sm text-aviso-texto">{cuenta.porVerificar} Yape por verificar</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="caja-mesas" className="min-w-0 rounded-2xl border border-borde bg-superficie p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="caja-mesas" className="text-xl font-semibold">Mesas</h2><Insignia tono="neutro">{mesasOcupadas} {mesasOcupadas === 1 ? "ocupada" : "ocupadas"}</Insignia></div>
        <details className="ayuda-discreta mt-1">
          <summary>Sobre las mesas</summary>
          <p className="text-sm text-texto-suave">
          Una mesa está ocupada mientras tenga una sesión abierta, aunque todavía no tenga pedidos.
          La apertura de mesas se gestiona desde el panel del mesero.
          </p>
        </details>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-marca underline" scroll={false} href={anterior ? "/caja#caja-mesas" : "/caja?vista=anterior#caja-mesas"}>
          {anterior ? "Ver mapa 3D" : "Ver solo la lista"}
        </Link>
        {!anterior && salones.length > 0 && (
          <PlanoMesas restauranteId={restauranteId} puedeEditar={false} mesas={prepararPlano(salones, mesas, cuentas)} />
        )}
        {mesas.length === 0 ? <p className="mt-3 rounded-lg border p-4 text-texto-suave">No hay mesas activas.</p> : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {mesas.map((mesa) => (
              <li key={mesa.id} className="flex flex-col rounded-xl border border-borde bg-superficie-suave p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Mesa {mesa.numero}</h3>
                  <Insignia tono={mesa.sesion ? "aviso" : "exito"}>{mesa.sesion ? "Ocupada" : "Libre"}</Insignia>
                </div>
                {!mesa.sesion && <p className="mt-2 text-sm text-texto-suave">Sin cuenta abierta.</p>}
                {mesa.sesion && <>
                  <p className="mt-2 text-sm text-texto-suave">No se puede abrir otra sesión: esta mesa ya tiene una cuenta abierta.</p>
                  <Link href={`/caja/mesa/${mesa.sesion.id}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-marca underline">
                    Ver cuenta de Mesa {mesa.numero}
                  </Link>
                </>}
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </main>
  );
}

export default function CajaPage({ searchParams }: PageProps<"/caja">) {
  return (
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="mx-auto w-full max-w-3xl p-6">Cargando caja…</main>}>
      <CajaPanel searchParams={searchParams} />
    </Suspense>
  );
}
