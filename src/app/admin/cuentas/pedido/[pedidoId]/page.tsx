import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requerirPanel } from "@/features/auth/sesion";
import { esUuid } from "@/features/mesero/solicitud-asistida";
import { obtenerCuentaParaLlevar } from "@/features/pago-cierre/cuentas";
import { DetalleCuenta } from "@/features/pago-cierre/detalle-cuenta";
import { CerrarCuenta } from "@/features/pago-cierre/cerrar-cuenta";
import { evaluarCierreAdmin } from "@/features/pago-cierre/cierre-logica";
import { ResumenCierre } from "@/features/pago-cierre/resumen-cierre";

// US-105: con un solo cajero, el dueño o el admin verifican aquí el Yape que registró otra persona.
// US-106: consulta de una cuenta para llevar y cierre con excepción (motivo obligatorio).
async function CuentaParaLlevarAdmin({ params }: PageProps<"/admin/cuentas/pedido/[pedidoId]">) {
  const { pedidoId } = await params;
  const { restauranteId, usuario } = await requerirPanel("admin");
  if (!esUuid(pedidoId)) notFound();
  const cuenta = await obtenerCuentaParaLlevar(restauranteId, pedidoId);
  if (!cuenta) notFound();

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/admin/cuentas" className="text-sm underline">← Cuentas y pagos</Link>
      <h1 className="mt-4 text-3xl font-bold">Cuenta · Para llevar N.º {cuenta.numero}</h1>
      {cuenta.nombre && <p className="mt-1 text-texto-suave">A nombre de {cuenta.nombre}</p>}
      <DetalleCuenta
        cuenta={cuenta}
        cerrada={cuenta.cierre !== null}
        verificacion={{ cuenta: { tipo: "PARA_LLEVAR", id: cuenta.pedidoId }, puedeVerificar: true, usuarioId: usuario.id }}
      />
      {cuenta.cierre && <ResumenCierre cierre={cuenta.cierre} />}
      {!cuenta.cierre && cuenta.pedidos.length > 0 && (
        <CerrarCuenta cuenta={{ tipo: "PARA_LLEVAR", id: cuenta.pedidoId }} estado={evaluarCierreAdmin(cuenta)} />
      )}
    </main>
  );
}

export default function CuentaParaLlevarAdminPage(props: PageProps<"/admin/cuentas/pedido/[pedidoId]">) {
  return (
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="mx-auto w-full max-w-3xl p-6">Cargando cuenta…</main>}>
      <CuentaParaLlevarAdmin {...props} />
    </Suspense>
  );
}
