import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requerirPanel } from "@/features/auth/sesion";
import { AccionesPedido } from "@/features/pedidos/acciones-pedido";
import { describirDestino } from "@/features/pedidos/modalidad";
import { obtenerDetallePedido } from "@/features/pedidos/pedidos-admin";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";
import { listarIncidencias } from "@/features/pedidos/incidencias-servidor";
import { IncidenciasPanel } from "@/features/pedidos/incidencias-panel";
import { TIPOS_INCIDENCIA_MESERO } from "@/features/pedidos/incidencias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function DetalleMesero({ params }: PageProps<"/mesero/pedidos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // US-106: solo el mesero; aquí actúa con su rol de mesero aunque tenga otros.
  const { restauranteId, roles } = await requerirPanel("mesero");
  const pedido = await obtenerDetallePedido(restauranteId, id);
  if (!pedido) notFound();
  const incidencias = await listarIncidencias(pedido.id);

  return <main id="contenido-principal" className="detalle-pedido mx-auto w-full max-w-3xl p-6">
    <Link href="/mesero" className="inline-flex min-h-11 items-center rounded-lg text-sm text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">← Panel mesero</Link>
    <h1 className="mt-4 text-3xl font-bold">Pedido n.º {pedido.numero}</h1>
    <p className="mt-2 text-texto-suave">{describirDestino(pedido)} · {ETIQUETA_ESTADO[pedido.estado]}</p>
    <AccionesPedido pedidoId={pedido.id} estado={pedido.estado} roles={roles} items={pedido.items} />
    <IncidenciasPanel pedidoId={pedido.id} estado={pedido.estado} incidencias={incidencias} tipos={TIPOS_INCIDENCIA_MESERO} />
    <h2 className="mt-8 text-xl font-semibold">Productos</h2>
    <ul className="mt-3 divide-y divide-borde rounded-2xl border border-borde bg-superficie">{pedido.items.map((item) => <li key={item.id} className="p-3">{item.nombre} × {item.cantidad}{item.observacion && <p className="text-sm text-texto-suave">{item.observacion}</p>}</li>)}</ul>
    <p className="mt-4 rounded-xl bg-marca-suave p-4 text-right text-xl font-bold tabular-nums">Total: {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(pedido.totalCentimos / 100)}</p>
  </main>;
}

export default function DetallePedidoMeseroPage(props: PageProps<"/mesero/pedidos/[id]">) {
  return <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="p-6">Cargando pedido…</main>}><DetalleMesero {...props} /></Suspense>;
}
