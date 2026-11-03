import Link from "next/link";
import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { formatearPrecio } from "@/features/carta/formato";
import { requerirCaja } from "@/features/pago-cierre/acceso-caja";
import { listarCuentasAbiertas } from "@/features/pago-cierre/cuentas";

const soles = (centimos: number) => formatearPrecio(centimos / 100);

async function CajaPanel() {
  const restauranteId = await requerirCaja();
  const cuentas = await listarCuentasAbiertas(restauranteId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Caja</h1>
        <form action={cerrarSesion}>
          <button className="min-h-11 rounded-lg border px-4 py-2">Cerrar sesión</button>
        </form>
      </header>

      <h2 className="mt-8 text-xl font-semibold">Cuentas por cobrar</h2>
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
                <span className={`font-bold ${cuenta.saldoCentimos > 0 ? "text-red-700" : "text-emerald-800"}`}>
                  {cuenta.saldoCentimos > 0 ? `Saldo ${soles(cuenta.saldoCentimos)}` : "Pagada"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
