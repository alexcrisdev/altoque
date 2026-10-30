import { Suspense } from "react";
import Link from "next/link";
import { requerirRol } from "@/features/auth/sesion";
import { listarPedidosAdmin } from "@/features/pedidos/pedidos-admin";
import { describirDestino } from "@/features/pedidos/modalidad";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "@/features/pedidos/estados";
import type { EstadoPedido, TonoEstado } from "@/features/pedidos/estados";

const clasesTono: Record<TonoEstado, string> = {
  neutro: "bg-slate-100 text-slate-700",
  info: "bg-sky-100 text-sky-800",
  aviso: "bg-amber-100 text-amber-900",
  progreso: "bg-blue-100 text-blue-800",
  exito: "bg-emerald-100 text-emerald-800",
  peligro: "bg-red-100 text-red-800",
};

function fechaLima(fecha: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(fecha));
}

async function ListaPedidosAdmin() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN")!.restaurantId;
  const pedidos = await listarPedidosAdmin(restauranteId);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link href="/admin" className="text-sm underline">← Panel administrador</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedidos recientes</h1>
      <p className="mt-2 text-slate-600">Últimos 30 pedidos del restaurante.</p>
      {pedidos.length === 0 ? (
        <p className="mt-8 rounded-lg border p-5">Todavía no hay pedidos.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {pedidos.map((pedido) => (
            <li key={pedido.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/admin/pedidos/${pedido.id}`} className="font-semibold underline">
                  Pedido n.º {pedido.numero}
                </Link>
                <p className="text-sm text-slate-600">{fechaLima(pedido.creadoEn)} · {describirDestino(pedido)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${clasesTono[TONO_ESTADO[pedido.estado as EstadoPedido]]}`}>
                {ETIQUETA_ESTADO[pedido.estado as EstadoPedido]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function PedidosAdminPage() {
  return (
    <Suspense fallback={<main className="p-6">Cargando pedidos…</main>}>
      <ListaPedidosAdmin />
    </Suspense>
  );
}
