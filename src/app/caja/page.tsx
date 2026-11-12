import Link from "next/link";
import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { formatearPrecio } from "@/features/carta/formato";
import { obtenerPanelCaja } from "@/features/pago-cierre/panel-actions";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";

const soles = (centimos: number) => formatearPrecio(centimos / 100);

async function CajaPanel() {
  const { cuentas, mesas } = await obtenerPanelCaja();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Caja</h1>
        <form action={cerrarSesion}>
          <button className="min-h-11 rounded-lg border px-4 py-2">Cerrar sesión</button>
        </form>
      </header>
      <ActualizacionAutomatica segundos={10} />

      <section aria-labelledby="caja-cuentas" className="mt-8">
        <h2 id="caja-cuentas" className="text-xl font-semibold">Cuentas por cobrar o cerrar</h2>
        {cuentas.length === 0 ? (
          <p className="mt-3 rounded-lg border p-4 text-zinc-700">No hay cuentas abiertas.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {cuentas.map((cuenta) => (
              <li key={cuenta.href}>
                <Link
                  href={cuenta.href}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border p-4 hover:bg-zinc-50"
                >
                  <span>
                    <span className="block text-lg font-semibold">{cuenta.titulo}</span>
                    <span className="text-sm text-zinc-600">
                      {cuenta.detalle} · consumo {soles(cuenta.consumoCentimos)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-bold ${cuenta.saldoCentimos > 0 ? "text-red-700" : "text-emerald-800"}`}>
                      {cuenta.saldoCentimos > 0 ? `Saldo ${soles(cuenta.saldoCentimos)}` : "Pagada · por cerrar"}
                    </span>
                    {cuenta.porVerificar > 0 && (
                      <span className="block text-sm text-amber-900">{cuenta.porVerificar} Yape por verificar</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="caja-mesas" className="mt-8">
        <h2 id="caja-mesas" className="text-xl font-semibold">Mesas</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Una mesa está ocupada mientras tenga una sesión abierta, aunque todavía no tenga pedidos.
          La apertura de mesas se gestiona desde el panel del mesero.
        </p>
        {mesas.length === 0 ? <p className="mt-3 rounded-lg border p-4 text-zinc-700">No hay mesas activas.</p> : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {mesas.map((mesa) => (
              <li key={mesa.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Mesa {mesa.numero}</h3>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${mesa.sesion ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-900"}`}>
                    {mesa.sesion ? "Ocupada" : "Libre"}
                  </span>
                </div>
                {mesa.sesion && <>
                  <p className="mt-2 text-sm text-zinc-700">
                    No se puede abrir otra sesión: esta mesa ya tiene una cuenta abierta.
                  </p>
                  <Link href={`/caja/mesa/${mesa.sesion.id}`}
                    className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-800 underline">
                    Ver cuenta de Mesa {mesa.numero}
                  </Link>
                </>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function CajaPage() {
  return (
    <Suspense fallback={<main role="status" aria-busy="true" className="mx-auto w-full max-w-3xl p-6">Cargando caja…</main>}>
      <CajaPanel />
    </Suspense>
  );
}
