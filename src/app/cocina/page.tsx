import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";
import { listarPedidosCocinaAction } from "@/features/pedidos/actions";
import { PedidosLista } from "@/features/pedidos/pedidos-lista";

async function CocinaPanel() {
  const sesion = await requerirRol(["KITCHEN", "OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => ["KITCHEN", "OWNER", "ADMIN"].includes(m.rol));
  if (!membresia) return null;

  const pedidos = await listarPedidosCocinaAction(membresia.restaurantId);
  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Panel cocina</h1>
        <form action={cerrarSesion}>
          <button className="min-h-11 rounded-lg border px-4 py-2">Cerrar sesión</button>
        </form>
      </header>
      <PedidosLista pedidos={pedidos} />
    </main>
  );
}

export default function CocinaPage() {
  return <Suspense fallback={<main className="p-8">Cargando panel…</main>}><CocinaPanel /></Suspense>;
}
