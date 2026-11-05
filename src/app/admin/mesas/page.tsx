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
import {
  listarLocales,
  listarMesas,
} from "@/features/acceso-qr/mesas";
import { listarMostradores } from "@/features/acceso-qr/mostrador";
import { requerirRol } from "@/features/auth/sesion";
import { BotonQr } from "./boton-qr";
import { FormularioNuevaMesa } from "./formulario-nueva-mesa";

async function PanelMesas() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);

  const restauranteId = sesion.membresias.find(
    (m) => m.rol === "OWNER" || m.rol === "ADMIN",
  )!.restaurantId;

  const [mesas, locales, mostradores] = await Promise.all([
    listarMesas(restauranteId),
    listarLocales(restauranteId),
    listarMostradores(restauranteId),
  ]);

  return (
    <>
      <FormularioNuevaMesa locales={locales} />

      <section
        aria-labelledby="titulo-lista-mesas"
        className="mt-8"
      >
        <h2
          id="titulo-lista-mesas"
          className="mb-4 text-xl font-semibold text-texto"
        >
          Mesas
        </h2>

        {mesas.length === 0 ? (
          <MensajeEstado
            tipo="vacio"
            titulo="No hay mesas registradas."
          />
        ) : (
          <ul className="grid gap-3">
            {mesas.map((mesa) => (
              <li key={mesa.id}>
                <Tarjeta className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">
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
                  </div>

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
                      <form action={desactivarQrAction}>
                        <input
                          type="hidden"
                          name="mesaId"
                          value={mesa.id}
                        />

                        <Boton
                          type="submit"
                          variante="peligro"
                        >
                          Desactivar QR
                        </Boton>
                      </form>
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
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="titulo-mostrador"
        className="mt-8"
      >
        <h2
          id="titulo-mostrador"
          className="text-xl font-semibold text-texto"
        >
          QR de mostrador (para llevar)
        </h2>

        <p className="mt-2 text-sm text-texto-suave">
          Un QR por local. El cliente lo escanea en caja y pide
          sin ocupar una mesa.
        </p>

        <div className="mt-4">
          {mostradores.length === 0 ? (
            <MensajeEstado
              tipo="vacio"
              titulo="No hay mostradores para mostrar."
            />
          ) : (
            <ul className="grid gap-3">
              {mostradores.map((mostrador) => (
                <li key={mostrador.localId}>
                  <Tarjeta className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {mostrador.local}
                      </h3>

                      <div className="mt-3">
                        <Insignia
                          tono={
                            mostrador.tieneQrActivo
                              ? "info"
                              : "aviso"
                          }
                        >
                          {mostrador.tieneQrActivo
                            ? "QR activo"
                            : "Sin QR"}
                        </Insignia>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <BotonQr
                        generar={generarQrMostradorAction}
                        campo="localId"
                        valor={mostrador.localId}
                        tieneQr={mostrador.tieneQrActivo}
                      />

                      {mostrador.tieneQrActivo && (
                        <form action={desactivarQrMostradorAction}>
                          <input
                            type="hidden"
                            name="localId"
                            value={mostrador.localId}
                          />

                          <Boton
                            type="submit"
                            variante="peligro"
                          >
                            Desactivar QR
                          </Boton>
                        </form>
                      )}
                    </div>
                  </Tarjeta>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

export default function MesasPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
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
        <PanelMesas />
      </Suspense>
    </main>
  );
}
