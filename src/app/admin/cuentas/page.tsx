import Link from "next/link";
import { Suspense } from "react";
import { Insignia, MensajeEstado } from "@/components/ui";
import { requerirPanel } from "@/features/auth/sesion";
import { formatearPrecio } from "@/features/carta/formato";
import { listarCuentasAbiertas } from "@/features/pago-cierre/cuentas";

const soles = (centimos: number) => formatearPrecio(centimos / 100);

// US-106: el dueño y el admin consultan cuentas y pagos (solo lectura). Cobrar y
// verificar es de caja; aquí solo se autoriza el cierre con excepción.
async function ListaCuentas() {
  const { restauranteId } = await requerirPanel("admin");
  const cuentas = await listarCuentasAbiertas(restauranteId, "/admin/cuentas");
  return cuentas.length === 0 ? (
    <div className="mt-6"><MensajeEstado tipo="vacio" titulo="No hay cuentas abiertas." /></div>
  ) : (
    <ul className="mt-6 grid gap-3">
      {cuentas.map((cuenta) => (
        <li key={cuenta.href}>
          <Link href={cuenta.href} className="flex min-h-11 flex-wrap items-center justify-between gap-4 rounded-2xl border border-borde bg-superficie p-5 hover:border-marca">
            <span className="min-w-0 flex-1 break-words">
              <span className="block text-lg font-semibold">{cuenta.titulo}</span>
              <span className="text-sm text-texto-suave">{cuenta.detalle} · consumo {soles(cuenta.consumoCentimos)} · pagado {soles(cuenta.pagadoCentimos)}</span>
            </span>
            <span className="text-left sm:text-right">
              <span className="block text-xl font-bold tabular-nums">
                {cuenta.saldoCentimos > 0 ? `Saldo ${soles(cuenta.saldoCentimos)}` : "Pagada"}
              </span>
              {cuenta.porVerificar > 0 && <Insignia tono="aviso">{cuenta.porVerificar} Yape por verificar en caja</Insignia>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function CuentasAdminPage() {
  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-3xl font-bold">Cuentas y pagos</h1>
      <p className="mt-2 text-texto-suave">
        Consulta las cuentas abiertas y sus pagos. Caja cobra y cierra; aquí solo se autoriza un cierre con excepción.
      </p>
      <Suspense fallback={<p role="status" aria-busy="true" className="mt-6">Cargando cuentas…</p>}>
        <ListaCuentas />
      </Suspense>
    </main>
  );
}
