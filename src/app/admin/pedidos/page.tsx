import { Suspense } from "react";
import Link from "next/link";
import { requerirRol } from "@/features/auth/sesion";
import { listarPedidosAdmin } from "@/features/pedidos/pedidos-admin";
import { PedidosAdminVista } from "@/features/pedidos/pedidos-admin-vista";

async function ListaPedidosAdmin() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN")!.restaurantId;
  const pedidos = await listarPedidosAdmin(restauranteId);

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-6xl p-6">
      <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg text-sm text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">← Panel administrador</Link>
      <h1 className="mt-4 text-3xl font-bold">Pedidos recientes</h1>
      <p className="mt-2 text-texto-suave">Últimos 30 pedidos del restaurante.</p>
      {pedidos.length === 0 ? (
        <p className="mt-8 rounded-lg border p-5">Todavía no hay pedidos.</p>
      ) : (
        <PedidosAdminVista pedidos={pedidos} />
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
