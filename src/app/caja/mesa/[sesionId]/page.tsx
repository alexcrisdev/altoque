import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { esUuid } from "@/features/mesero/solicitud-asistida";
import { requerirCaja } from "@/features/pago-cierre/acceso-caja";
import { obtenerCuentaMesa } from "@/features/pago-cierre/cuentas";
import { DetalleCuenta } from "@/features/pago-cierre/detalle-cuenta";
import { RegistrarPagoEfectivo } from "@/features/pago-cierre/registrar-pago-efectivo";

async function CuentaMesa({ params }: PageProps<"/caja/mesa/[sesionId]">) {
  const { sesionId } = await params;
  const restauranteId = await requerirCaja();
  if (!esUuid(sesionId)) notFound();
  const cuenta = await obtenerCuentaMesa(restauranteId, sesionId);
  if (!cuenta) notFound();

  const desde = new Date(cuenta.abiertaDesde).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/caja" className="text-sm underline">← Volver a caja</Link>
      <h1 className="mt-4 text-3xl font-bold">Cuenta · Mesa {cuenta.mesaNumero}</h1>
      <p className="mt-1 text-zinc-600">
        {cuenta.cerrada ? "Mesa cerrada" : `Mesa abierta desde las ${desde}`}
      </p>
      <DetalleCuenta cuenta={cuenta} cerrada={cuenta.cerrada} />
      {!cuenta.cerrada && (
        <RegistrarPagoEfectivo cuenta={{ tipo: "MESA", id: cuenta.sesionId }} saldoCentimos={cuenta.saldoCentimos} />
      )}
    </main>
  );
}

export default function CuentaMesaPage(props: PageProps<"/caja/mesa/[sesionId]">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl p-6">Cargando cuenta…</main>}>
      <CuentaMesa {...props} />
    </Suspense>
  );
}
