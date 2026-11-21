import { Suspense } from "react";
import Link from "next/link";
import { requerirRol } from "@/features/auth/sesion";
import { listarPedidosAdmin } from "@/features/pedidos/pedidos-admin";
import { describirDestino } from "@/features/pedidos/modalidad";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "@/features/pedidos/estados";
import type { EstadoPedido, TonoEstado } from "@/features/pedidos/estados";

const clasesTono: Record<TonoEstado, string> = {
  neutro: "bg-neutro-fondo text-neutro-texto",
  info: "bg-info-fondo text-info-texto",
  aviso: "bg-aviso-fondo text-aviso-texto",
  progreso: "bg-progreso-fondo text-progreso-texto",
  exito: "bg-exito-fondo text-exito-texto",
  peligro: "bg-peligro-fondo text-peligro-texto",
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
    <main id="contenido-principal" className="mx-auto max-w-5xl p-6">
      <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg text-sm text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">← Panel administrador</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedidos recientes</h1>
      <p className="mt-2 text-texto-suave">Últimos 30 pedidos del restaurante.</p>
      {pedidos.length === 0 ? (
        <p className="mt-8 rounded-lg border p-5">Todavía no hay pedidos.</p>
      ) : (
        <ul className="mt-6 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {pedidos.map((pedido) => (
            <li key={pedido.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/admin/pedidos/${pedido.id}`} className="inline-flex min-h-11 items-center rounded-lg font-semibold text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
                  Pedido n.º {pedido.numero}
                </Link>
                <p className="text-sm text-texto-suave">{fechaLima(pedido.creadoEn)} · {describirDestino(pedido)}</p>
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
    <Suspense fallback={<main id="contenido-principal" role="status" aria-busy="true" className="p-6">Cargando pedidos…</main>}>
      <ListaPedidosAdmin />
    </Suspense>
  );
}
