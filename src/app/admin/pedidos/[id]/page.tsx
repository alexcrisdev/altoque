import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/features/auth/sesion";
import { obtenerHistorialPedido } from "@/features/pedidos/historial";
import { describirDestino } from "@/features/pedidos/modalidad";
import { obtenerDetallePedido } from "@/features/pedidos/pedidos-admin";
import { AccionesPedido } from "@/features/pedidos/acciones-pedido";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";
import { listarIncidencias } from "@/features/pedidos/incidencias-servidor";
import { IncidenciasPanel } from "@/features/pedidos/incidencias-panel";

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
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN")!.restaurantId;
  const pedido = await obtenerDetallePedido(restauranteId, id);
  if (!pedido) notFound();
  const historial = await obtenerHistorialPedido(pedido.id);
  const incidencias = await listarIncidencias(pedido.id);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/admin/pedidos" className="text-sm underline">← Volver a pedidos</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedido n.º {pedido.numero}</h1>
      <p className="mt-2 text-slate-600">{fechaLima(pedido.creadoEn)} · {describirDestino(pedido)} · {ETIQUETA_ESTADO[pedido.estado]}</p>
      <AccionesPedido pedidoId={pedido.id} estado={pedido.estado} roles={sesion.membresias.filter((m) => m.restaurantId === restauranteId).map((m) => m.rol)} items={pedido.items} />
      <IncidenciasPanel pedidoId={pedido.id} estado={pedido.estado} incidencias={incidencias} soloLectura />
      <h2 className="mt-8 text-xl font-semibold">Productos</h2>
      <ul className="mt-3 divide-y rounded-lg border">
        {pedido.items.map((item) => <li key={item.id} className="flex justify-between gap-4 p-3"><span>{item.nombre} × {item.cantidad}{item.observacion && <span className="block text-sm text-slate-600">{item.observacion}</span>}</span><span>{new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(item.precioUnitarioCentimos * item.cantidad / 100)}</span></li>)}
      </ul>
      <p className="mt-3 text-right font-semibold">Total: {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(pedido.totalCentimos / 100)}</p>
      <h2 className="mt-8 text-xl font-semibold">Historial de estados</h2>
      {historial.length === 0 ? (
        <p className="mt-4">Este pedido todavía no tiene cambios registrados.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l-2 border-slate-200 pl-5">
          {historial.map((cambio) => (
            <li key={cambio.id} className="relative rounded-lg border p-4">
              <span className="absolute -left-[1.65rem] top-5 h-3 w-3 rounded-full bg-slate-500" />
              <p className="font-semibold">
                {cambio.evento === "MODIFIED" ? "Pedido modificado" : cambio.desde ? `${ETIQUETA_ESTADO[cambio.desde]} → ${ETIQUETA_ESTADO[cambio.hacia]}` : "Inicio del pedido"}
              </p>
              <p className="mt-1 text-sm text-slate-600">{cambio.cambiadoPor} · {fechaLima(cambio.creadoEn)}</p>
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
    <Suspense fallback={<main className="p-6">Cargando pedido…</main>}>
      <DetallePedido {...props} />
    </Suspense>
  );
}
