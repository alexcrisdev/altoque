import Link from "next/link";
import { Suspense } from "react";
import {
  cambiarEstadoMesaAction,
  desactivarQrAction,
  desactivarQrMostradorAction,
  generarQrAction,
  generarQrMostradorAction,
} from "@/features/acceso-qr/actions";
import { listarLocales, listarMesas } from "@/features/acceso-qr/mesas";
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

      <ul className="mt-6 grid gap-3">
        {mesas.map((mesa) => (
          <li
            key={mesa.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded border p-4"
          >
            <div>
              <p className="text-lg font-semibold">Mesa {mesa.numero}</p>
              <p className="text-sm text-zinc-600">{mesa.local}</p>
              <p className="mt-1 text-sm">
                {mesa.activa ? "Activa" : "Inactiva"} ·{" "}
                {mesa.tieneQrActivo ? "QR activo" : <span className="text-amber-700">Sin QR</span>}
              </p>
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
                  <input type="hidden" name="mesaId" value={mesa.id} />
                  <button className="rounded border px-3 py-1">Desactivar QR</button>
                </form>
              )}

              <form action={cambiarEstadoMesaAction}>
                <input type="hidden" name="mesaId" value={mesa.id} />
                <input type="hidden" name="activa" value={String(!mesa.activa)} />
                <button className="rounded border px-3 py-1">
                  {mesa.activa ? "Desactivar mesa" : "Activar mesa"}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="titulo-mostrador" className="mt-10">
        <h2 id="titulo-mostrador" className="text-2xl font-bold">
          QR de mostrador (para llevar)
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Un QR por local. El cliente lo escanea en caja y pide sin ocupar una mesa.
        </p>

        <ul className="mt-4 grid gap-3">
          {mostradores.map((mostrador) => (
            <li
              key={mostrador.localId}
              className="flex flex-wrap items-start justify-between gap-4 rounded border p-4"
            >
              <div>
                <p className="text-lg font-semibold">{mostrador.local}</p>
                <p className="mt-1 text-sm">
                  {mostrador.tieneQrActivo ? (
                    "QR activo"
                  ) : (
                    <span className="text-amber-700">Sin QR</span>
                  )}
                </p>
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
                    <input type="hidden" name="localId" value={mostrador.localId} />
                    <button className="rounded border px-3 py-1">Desactivar QR</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function MesasPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline">
        ← Panel administrador
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Mesas y códigos QR</h1>
      <Suspense fallback={<p className="mt-6">Cargando mesas…</p>}>
        <PanelMesas />
      </Suspense>
    </main>
  );
}