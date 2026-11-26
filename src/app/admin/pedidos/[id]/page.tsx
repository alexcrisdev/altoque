import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPanel } from "@/features/auth/sesion";
import { obtenerHistorialPedido } from "@/features/pedidos/historial";
import { describirDestino } from "@/features/pedidos/modalidad";
import { obtenerDetallePedido } from "@/features/pedidos/pedidos-admin";
import { AccionesPedido } from "@/features/pedidos/acciones-pedido";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";
import { etiquetaNumeroDia } from "@/features/pedidos/numero-dia";
import { listarIncidencias } from "@/features/pedidos/incidencias-servidor";
import { IncidenciasPanel } from "@/features/pedidos/incidencias-panel";
import { consultarPedidoPagado } from "@/features/pedidos/pago-pedido";
import { obtenerDevolucionPedido } from "@/features/pago-cierre/devoluciones";
import { DevolucionPedido } from "@/features/pago-cierre/devoluciones-vista";
import { Insignia } from "@/components/ui";

function fechaLima(fecha: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(fecha));
}

async function DetallePedido({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  // US-106: dueño y admin consultan; como excepción (con motivo) cancelan o modifican en preparación.
  const { restauranteId, roles } = await requerirPanel("admin");
  const pedido = await obtenerDetallePedido(restauranteId, id);
  if (!pedido) notFound();
  const historial = await obtenerHistorialPedido(pedido.id);
  const incidencias = await listarIncidencias(pedido.id);
  // US-105: pago confirmado y devolución, si se canceló pagado.
  const [pagado, devolucion] = await Promise.all([
    pedido.estado === "CANCELLED" ? Promise.resolve(false) : consultarPedidoPagado(pedido.id),
    obtenerDevolucionPedido(restauranteId, pedido.id),
  ]);

  return (
    <main id="contenido-principal" className="detalle-pedido mx-auto w-full max-w-3xl p-6">
      <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center rounded-lg text-sm text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">← Volver a pedidos</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedido {etiquetaNumeroDia(pedido.numero, pedido.fecha)}</h1>
      <p className="mt-2 text-texto-suave">{fechaLima(pedido.creadoEn)} · {describirDestino(pedido)} · {ETIQUETA_ESTADO[pedido.estado]}</p>
      {pagado && <p className="mt-2"><Insignia tono="exito">Pagado</Insignia></p>}
      {devolucion && (
        <section aria-label="Devolución" className="mt-4 rounded-2xl border border-borde bg-superficie p-5">
          <DevolucionPedido devolucion={devolucion} puedeMarcar />
        </section>
      )}
      <AccionesPedido pedidoId={pedido.id} estado={pedido.estado} roles={roles} items={pedido.items} pagado={pagado} />
      <IncidenciasPanel pedidoId={pedido.id} estado={pedido.estado} incidencias={incidencias} soloLectura />
      <h2 className="mt-8 text-xl font-semibold">Productos</h2>
      <ul className="mt-3 divide-y divide-borde rounded-2xl border border-borde bg-superficie">
        {pedido.items.map((item) => <li key={item.id} className="flex justify-between gap-4 p-4"><span>{item.nombre} × {item.cantidad}{item.observacion && <span className="block text-sm text-texto-suave">{item.observacion}</span>}</span><span>{new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(item.precioUnitarioCentimos * item.cantidad / 100)}</span></li>)}
      </ul>
      <p className="mt-4 rounded-xl bg-marca-suave p-4 text-right text-xl font-bold tabular-nums">Total: {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(pedido.totalCentimos / 100)}</p>
      <h2 className="mt-8 text-xl font-semibold">Historial de estados</h2>
      {historial.length === 0 ? (
        <p className="mt-4">Este pedido todavía no tiene cambios registrados.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l-2 border-borde pl-5">
          {historial.map((cambio) => (
            <li key={cambio.id} className="relative rounded-xl border border-borde bg-superficie p-4">
              <span className="absolute -left-[1.65rem] top-5 h-3 w-3 rounded-full bg-marca" />
              <p className="font-semibold">
                {cambio.evento === "MODIFIED" ? "Pedido modificado" : cambio.desde ? `${ETIQUETA_ESTADO[cambio.desde]} → ${ETIQUETA_ESTADO[cambio.hacia]}` : "Inicio del pedido"}
              </p>
              <p className="mt-1 text-sm text-texto-suave">{cambio.cambiadoPor} · {fechaLima(cambio.creadoEn)}</p>
              {cambio.detalle && <p className="mt-2">{cambio.detalle}</p>}
              {cambio.motivo && <p className="mt-2">Motivo: {cambio.motivo}</p>}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

export default function DetallePedidoAdminPage(props: PageProps<"/admin/pedidos/[id]">) {
  return (
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="p-6">Cargando pedido…</main>}>
      <DetallePedido {...props} />
    </Suspense>
  );
}
