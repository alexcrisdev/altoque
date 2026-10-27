import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";
import { listarMesasConSesion } from "@/features/mesero/sesiones";
import { listarPedidosMeseroAction } from "@/features/pedidos/actions";
import { PedidosLista } from "@/features/pedidos/pedidos-lista";
import { BotonAbrirSesion, BotonCerrarSesion } from "./acciones-sesion";

async function MeseroPanel() {
  const sesion = await requerirRol(["WAITER", "OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => ["WAITER", "OWNER", "ADMIN"].includes(m.rol));
  if (!membresia) return null;

  const mesas = await listarMesasConSesion(membresia.restaurantId);
  const pedidos = await listarPedidosMeseroAction(membresia.restaurantId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Panel mesero</h1>
        <form action={cerrarSesion}>
          <button className="min-h-11 rounded-lg border px-4 py-2">Cerrar sesión</button>
        </form>
      </header>

      <h2 className="mt-8 text-xl font-semibold">Mesas</h2>
      {mesas.length === 0 ? (
        <p className="mt-3 rounded-lg border p-4 text-zinc-700">No hay mesas activas en este restaurante.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {mesas.map((mesa) => {
            const ocupadaDesde = mesa.sesion
              ? new Date(mesa.sesion.abiertaDesde).toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                   timeZone: "America/Lima",
                })
              : null;

            return (
              <li
                key={mesa.id}
                className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-lg font-semibold">Mesa {mesa.numero}</p>
                  <p className={ocupadaDesde ? "text-sm text-amber-800" : "text-sm text-emerald-800"}>
                    {ocupadaDesde ? `Ocupada desde ${ocupadaDesde}` : "Libre"}
                  </p>
                </div>
                {mesa.sesion ? (
                  <BotonCerrarSesion sesionId={mesa.sesion.id} />
                ) : (
                  <BotonAbrirSesion mesaId={mesa.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <PedidosLista pedidos={pedidos} />
    </main>
  );
}

export default function MeseroPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl p-6">Cargando panel…</main>}>
      <MeseroPanel />
    </Suspense>
  );
}
