import Link from "next/link";
import { PlanoMesas } from "@/features/plano-mesas/plano-mesas";
import { obtenerPanelMesasAdmin } from "@/features/plano-mesas/actions";
import { Suspense } from "react";
import {
  Boton,
  BotonEnlace,
  EncabezadoPantalla,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import {
  cambiarEstadoMesaAction,
  desactivarQrAction,
  desactivarQrMostradorAction,
  generarQrAction,
  generarQrMostradorAction,
} from "@/features/acceso-qr/actions";
import { BotonDesactivarQr } from "./boton-desactivar-qr";
import { BotonQr } from "./boton-qr";
import { FormularioNuevaMesa } from "./formulario-nueva-mesa";
import { QrGuardado } from "./qr-guardado";
import { PlanoMostrador } from "./plano-mostrador";
import "./zonas.css";

type Mostrador = Awaited<ReturnType<typeof obtenerPanelMesasAdmin>>["mostradores"][number];

function ControlesMostrador({ mostrador }: { mostrador: Mostrador }) {
  return <div className="flex flex-wrap items-start gap-2">
    <BotonQr generar={generarQrMostradorAction} campo="localId" valor={mostrador.localId} tieneQr={mostrador.tieneQrActivo} />
    {mostrador.tieneQrActivo && <BotonDesactivarQr desactivar={desactivarQrMostradorAction} campo="localId" valor={mostrador.localId} />}
  </div>;
}

function ControlesMesa({ mesa }: { mesa: { id: string; activa: boolean; tieneQrActivo: boolean } }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {mesa.activa && (
        <BotonQr
          generar={generarQrAction}
          campo="mesaId"
          valor={mesa.id}
          tieneQr={mesa.tieneQrActivo}
        />
      )}

      {mesa.tieneQrActivo && (
        <BotonDesactivarQr desactivar={desactivarQrAction} campo="mesaId" valor={mesa.id} />
      )}

      <form action={cambiarEstadoMesaAction}>
        <input
          type="hidden"
          name="mesaId"
          value={mesa.id}
        />

        <input
          type="hidden"
          name="activa"
          value={String(!mesa.activa)}
        />

        <Boton
          type="submit"
          variante={
            mesa.activa ? "secundario" : "primario"
          }
        >
          {mesa.activa
            ? "Desactivar mesa"
            : "Activar mesa"}
        </Boton>
      </form>
    </div>
  );
}

async function PanelMesas({ searchParams }: Pick<PageProps<"/admin/mesas">, "searchParams">) {
  const { vista } = await searchParams;
  const anterior = vista === "anterior";
  const enMostrador = vista === "mostrador";
  const { restauranteId, locales, mesas, mostradores, plano } = await obtenerPanelMesasAdmin(!anterior && !enMostrador);
  const porId = new Map(mesas.map(mesa => [mesa.id, mesa]));
  return (
    <>
      {anterior ? <FormularioNuevaMesa locales={locales} /> : (
        <div className="zonas-cabecera">
          <nav aria-label="Zona de atención" className="zonas-selector">
            <Link href="/admin/mesas" scroll={false} aria-current={!enMostrador ? "page" : undefined}>Salón</Link>
            <Link href="/admin/mesas?vista=mostrador" scroll={false} aria-current={enMostrador ? "page" : undefined}>Mostrador</Link>
          </nav>
          <Link className="zonas-anterior" href="/admin/mesas?vista=anterior">Vista anterior</Link>
        </div>
      )}

      {!enMostrador && <section
        aria-labelledby="titulo-lista-mesas"
        className="mt-8"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <h2 id="titulo-lista-mesas" className="flex min-h-11 items-center text-xl font-semibold text-texto">
            Mesas
          </h2>
          {anterior ? (
            <Link scroll={false} className="zonas-anterior" href="/admin/mesas">Ver mapa 3D</Link>
          ) : (
            <details className="alta-mesa ml-auto max-w-full">
              <summary className="ml-auto min-h-11 w-fit rounded-xl border border-borde bg-superficie px-3 py-2.5 text-sm font-semibold text-marca-hover hover:bg-marca-suave">Agregar mesa</summary>
              <FormularioNuevaMesa locales={locales} />
            </details>
          )}
        </div>
        {mesas.length === 0 ? (
          <MensajeEstado
            tipo="vacio"
            titulo="No hay mesas registradas."
          />
        ) : !anterior ? (
          <PlanoMesas restauranteId={restauranteId} puedeEditar mesas={plano.map(m => ({
            ...m, href: null, qr: porId.get(m.id)?.tieneQrActivo ? "QR activo" : "Sin QR",
          }))} detalles={Object.fromEntries(mesas.map(mesa => [mesa.id, <div key={mesa.id} className="grid gap-2">
            {mesa.qr && <details className="plano-opciones">
              <summary>Ver QR</summary>
              <QrGuardado {...mesa.qr} etiqueta={`mesa ${mesa.numero}`} />
            </details>}
            <details className="plano-opciones">
              <summary>Más opciones</summary>
              <ControlesMesa mesa={mesa} />
            </details>
          </div>]))} />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {mesas.map((mesa) => (
              <li key={mesa.id}>
                <Tarjeta className="mesa-admin flex h-full flex-col items-start justify-between gap-5">
                  <div>
                    <h3 className="text-2xl font-bold tabular-nums">
                      Mesa {mesa.numero}
                    </h3>

                    <p className="mt-1 text-sm text-texto-suave">
                      {mesa.local}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Insignia
                        tono={mesa.activa ? "exito" : "neutro"}
                      >
                        {mesa.activa ? "Activa" : "Inactiva"}
                      </Insignia>

                      <Insignia
                        tono={mesa.tieneQrActivo ? "info" : "aviso"}
                      >
                        {mesa.tieneQrActivo
                          ? "QR activo"
                          : "Sin QR"}
                      </Insignia>
                    </div>

                    {mesa.qr && (
                      <div className="mt-3">
                        <QrGuardado {...mesa.qr} etiqueta={`mesa ${mesa.numero}`} />
                      </div>
                    )}
                  </div>

                  <ControlesMesa mesa={mesa} />
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(enMostrador || anterior) && <section
        aria-labelledby="titulo-mostrador"
        className={enMostrador ? "zona-mostrador mt-6" : "mt-8"}
      >
        <h2
          id="titulo-mostrador"
          className="text-xl font-semibold text-texto"
        >
          {enMostrador ? "QR de mostrador" : "QR de mostrador (para llevar)"}
        </h2>

        <p className="mt-2 text-sm text-texto-suave">
          {enMostrador ? "El cliente escanea el código del local y hace su pedido para llevar." :
            "Un QR por local. El cliente lo escanea en caja y pide sin ocupar una mesa."}
        </p>

        <div className="mt-4">
          {mostradores.length === 0 ? (
            <MensajeEstado
              tipo="vacio"
              titulo="No hay mostradores para mostrar."
            />
          ) : enMostrador ? (
            <PlanoMostrador estaciones={mostradores.map(m => ({
              id: m.localId, local: m.local, activo: m.tieneQrActivo,
              controles: <div key={m.localId} className="grid gap-3">
                {m.qr && <details className="plano-opciones">
                  <summary>Ver QR</summary><QrGuardado {...m.qr} etiqueta={`mostrador ${m.local}`} />
                </details>}
                <details className="plano-opciones" open={!m.tieneQrActivo}>
                  <summary>Gestionar QR</summary><ControlesMostrador mostrador={m} />
                </details>
              </div>,
            }))} />
          ) : (
            <ul className="grid gap-3">
              {mostradores.map((mostrador) => (
                <li key={mostrador.localId}>
                  <Tarjeta className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h3 className="text-2xl font-bold tabular-nums">{mostrador.local}</h3>
                        <div className="mt-3">
                          <Insignia tono={mostrador.tieneQrActivo ? "info" : "aviso"}>
                            {mostrador.tieneQrActivo ? "QR activo" : "Sin QR"}
                          </Insignia>
                        </div>

                      {mostrador.qr && (
                        <div className="mt-3">
                          <QrGuardado {...mostrador.qr} etiqueta={`mostrador ${mostrador.local}`} />
                        </div>
                      )}
                    </div>

                    <ControlesMostrador mostrador={mostrador} />
                  </Tarjeta>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>}
    </>
  );
}

export default function MesasPage({ searchParams }: PageProps<"/admin/mesas">) {
  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <BotonEnlace
          href="/admin"
          variante="fantasma"
        >
          ← Panel administrador
        </BotonEnlace>
      </div>

      <EncabezadoPantalla titulo="Mesas y códigos QR" />

      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando mesas…"
          />
        }
      >
        <PanelMesas searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
