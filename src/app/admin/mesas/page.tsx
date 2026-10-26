import Link from "next/link";
import { Suspense } from "react";
import { cambiarEstadoMesaAction, desactivarQrAction } from "@/features/acceso-qr/actions";
import { listarLocales, listarMesas } from "@/features/acceso-qr/mesas";
import { requerirRol } from "@/features/auth/sesion";
import { BotonQr } from "./boton-qr";
import { FormularioNuevaMesa } from "./formulario-nueva-mesa";

async function PanelMesas() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find(
    (m) => m.rol === "OWNER" || m.rol === "ADMIN",
  )!.restaurantId;

  const [mesas, locales] = await Promise.all([
    listarMesas(restauranteId),
    listarLocales(restauranteId),
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
              {mesa.activa && <BotonQr mesaId={mesa.id} tieneQr={mesa.tieneQrActivo} />}

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