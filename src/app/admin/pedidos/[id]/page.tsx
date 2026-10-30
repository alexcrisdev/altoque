import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/features/auth/sesion";
import { obtenerHistorialPedido } from "@/features/pedidos/historial";
import { describirDestino } from "@/features/pedidos/modalidad";
import { obtenerPedidoAdmin } from "@/features/pedidos/pedidos-admin";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";

function fechaLima(fecha: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(fecha));
}

async function DetallePedido({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN")!.restaurantId;
  const pedido = await obtenerPedidoAdmin(restauranteId, id);
  if (!pedido) notFound();
  const historial = await obtenerHistorialPedido(pedido.id);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/admin/pedidos" className="text-sm underline">← Volver a pedidos</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedido n.º {pedido.numero}</h1>
      <p className="mt-2 text-slate-600">{fechaLima(pedido.creadoEn)} · {describirDestino(pedido)} · {ETIQUETA_ESTADO[pedido.estado]}</p>
      <h2 className="mt-8 text-xl font-semibold">Historial de estados</h2>
      {historial.length === 0 ? (
        <p className="mt-4">Este pedido todavía no tiene cambios registrados.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l-2 border-slate-200 pl-5">
          {historial.map((cambio) => (
            <li key={cambio.id} className="relative rounded-lg border p-4">
              <span className="absolute -left-[1.65rem] top-5 h-3 w-3 rounded-full bg-slate-500" />
              <p className="font-semibold">
                {cambio.desde ? ETIQUETA_ESTADO[cambio.desde] : "Inicio"} → {ETIQUETA_ESTADO[cambio.hacia]}
              </p>
              <p className="mt-1 text-sm text-slate-600">{cambio.cambiadoPor} · {fechaLima(cambio.creadoEn)}</p>
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
