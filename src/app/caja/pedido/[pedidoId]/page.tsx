import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { esUuid } from "@/features/mesero/solicitud-asistida";
import { contextoCaja } from "@/features/pago-cierre/acceso-caja";
import { obtenerCuentaParaLlevar } from "@/features/pago-cierre/cuentas";
import { DetalleCuenta } from "@/features/pago-cierre/detalle-cuenta";
import { CobrarCuenta } from "@/features/pago-cierre/cobrar-cuenta";

async function CuentaParaLlevar({ params }: PageProps<"/caja/pedido/[pedidoId]">) {
  const { pedidoId } = await params;
  const { restauranteId, puedeVerificar } = await contextoCaja();
  if (!esUuid(pedidoId)) notFound();
  const cuenta = await obtenerCuentaParaLlevar(restauranteId, pedidoId);
  if (!cuenta) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/caja" className="text-sm underline">← Volver a caja</Link>
      <h1 className="mt-4 text-3xl font-bold">Cuenta · Para llevar N.º {cuenta.numero}</h1>
      {cuenta.nombre && <p className="mt-1 text-zinc-600">A nombre de {cuenta.nombre}</p>}
      <DetalleCuenta
        cuenta={cuenta}
        verificacion={{ cuenta: { tipo: "PARA_LLEVAR", id: cuenta.pedidoId }, puedeVerificar }}
      />
      {cuenta.pedidos.length > 0 && (
        <CobrarCuenta cuenta={{ tipo: "PARA_LLEVAR", id: cuenta.pedidoId }} saldoCentimos={cuenta.saldoCentimos} />
      )}
    </main>
  );
}

export default function CuentaParaLlevarPage(props: PageProps<"/caja/pedido/[pedidoId]">) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl p-6">Cargando cuenta…</main>}>
      <CuentaParaLlevar {...props} />
    </Suspense>
  );
}
