import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requerirPanel } from "@/features/auth/sesion";
import { esUuid } from "@/features/mesero/solicitud-asistida";
import { obtenerCuentaMesa } from "@/features/pago-cierre/cuentas";
import { DetalleCuenta } from "@/features/pago-cierre/detalle-cuenta";
import { CerrarCuenta } from "@/features/pago-cierre/cerrar-cuenta";
import { evaluarCierreAdmin } from "@/features/pago-cierre/cierre-logica";
import { ResumenCierre } from "@/features/pago-cierre/resumen-cierre";

// US-105: con un solo cajero, el dueño o el admin verifican aquí el Yape que registró otra persona.
// US-106: consulta de la cuenta de una mesa y cierre con excepción (motivo obligatorio).
async function CuentaMesaAdmin({ params }: PageProps<"/admin/cuentas/mesa/[sesionId]">) {
  const { sesionId } = await params;
  const { restauranteId, usuario } = await requerirPanel("admin");
  if (!esUuid(sesionId)) notFound();
  const cuenta = await obtenerCuentaMesa(restauranteId, sesionId);
  if (!cuenta) notFound();

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/admin/cuentas" className="text-sm underline">← Cuentas y pagos</Link>
      <h1 className="mt-4 text-3xl font-bold">Cuenta · Mesa {cuenta.mesaNumero}</h1>
      <p className="mt-1 text-texto-suave">{cuenta.cerrada ? "Mesa cerrada" : "Mesa abierta"}</p>
      <DetalleCuenta
        cuenta={cuenta}
        cerrada={cuenta.cerrada}
        verificacion={{ cuenta: { tipo: "MESA", id: cuenta.sesionId }, puedeVerificar: true, usuarioId: usuario.id }}
      />
      {cuenta.cierre && <ResumenCierre cierre={cuenta.cierre} />}
      {!cuenta.cerrada && (
        <CerrarCuenta cuenta={{ tipo: "MESA", id: cuenta.sesionId }} estado={evaluarCierreAdmin(cuenta, true)} />
      )}
    </main>
  );
}

export default function CuentaMesaAdminPage(props: PageProps<"/admin/cuentas/mesa/[sesionId]">) {
  return (
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="mx-auto w-full max-w-3xl p-6">Cargando cuenta…</main>}>
      <CuentaMesaAdmin {...props} />
    </Suspense>
  );
}
