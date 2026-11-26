import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { esUuid } from "@/features/mesero/solicitud-asistida";
import { contextoCaja } from "@/features/pago-cierre/acceso-caja";
import { obtenerCuentaMesa } from "@/features/pago-cierre/cuentas";
import { DetalleCuenta } from "@/features/pago-cierre/detalle-cuenta";
import { CobrarCuenta } from "@/features/pago-cierre/cobrar-cuenta";
import { CerrarCuenta } from "@/features/pago-cierre/cerrar-cuenta";
import { evaluarCierre } from "@/features/pago-cierre/cierre-logica";
import { ResumenCierre } from "@/features/pago-cierre/resumen-cierre";
import { TotalBilletera } from "@/features/pago-cierre/total-billetera";
import { obtenerPedidosPagoCajaAction } from "@/features/pago-cierre/pago-en-caja-actions";

async function CuentaMesa({ params, searchParams }: PageProps<"/caja/mesa/[sesionId]">) {
  const { sesionId } = await params;
  const { restauranteId, puedeVerificar, autorizaExcepcion, usuarioId } = await contextoCaja();
  if (!esUuid(sesionId)) notFound();
  const cuenta = await obtenerCuentaMesa(restauranteId, sesionId);
  if (!cuenta) notFound();
  const { pagaEnCaja } = await searchParams;
  const pedidoCaja = typeof pagaEnCaja === "string"
    ? (await obtenerPedidosPagoCajaAction(pagaEnCaja).catch(() => []))
      .find((pedido) => pedido.mesa_sesion_id === cuenta.sesionId)
    : null;

  const desde = new Date(cuenta.abiertaDesde).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/caja" className="text-sm underline">← Volver a caja</Link>
      <h1 className="mt-4 text-3xl font-bold">Cuenta · Mesa {cuenta.mesaNumero}</h1>
      <p className="mt-1 text-texto-suave">
        {cuenta.cerrada ? "Mesa cerrada" : `Mesa abierta desde las ${desde}`}
      </p>
      <DetalleCuenta
        cuenta={cuenta}
        cerrada={cuenta.cerrada}
        verificacion={{ cuenta: { tipo: "MESA", id: cuenta.sesionId }, puedeVerificar, usuarioId }}
      />
      {cuenta.cierre && <ResumenCierre cierre={cuenta.cierre} />}
      {cuenta.cierre && <TotalBilletera restauranteId={restauranteId} />}
      {!cuenta.cerrada && (
        <>
          {pedidoCaja ? (
            <CobrarCuenta cuenta={{ tipo: "MESA", id: cuenta.sesionId }} saldoCentimos={pedidoCaja.saldo_centimos}
              pedidoDestino={{ id: pedidoCaja.pedido_id, numero: pedidoCaja.numero }} />
          ) : pagaEnCaja !== undefined ? (
            <p id="registrar-pago" role="status" className="mt-6 text-sm text-texto-suave">
              Este pedido ya no está en la lista de pagos en caja. Revisa su estado en la cuenta.
            </p>
          ) : cuenta.saldoCentimos > 0 && (
            <CobrarCuenta cuenta={{ tipo: "MESA", id: cuenta.sesionId }} saldoCentimos={cuenta.saldoCentimos} />
          )}
          <CerrarCuenta
            cuenta={{ tipo: "MESA", id: cuenta.sesionId }}
            estado={evaluarCierre(cuenta, autorizaExcepcion, true)}
          />
        </>
      )}
    </main>
  );
}

export default function CuentaMesaPage(props: PageProps<"/caja/mesa/[sesionId]">) {
  return (
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="mx-auto w-full max-w-3xl p-6">Cargando cuenta…</main>}>
      <CuentaMesa {...props} />
    </Suspense>
  );
}
