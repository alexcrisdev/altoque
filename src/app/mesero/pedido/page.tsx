import Link from "next/link";
import { Suspense } from "react";
import { listarLocales } from "@/features/acceso-qr/mesas";
import { requerirRol } from "@/features/auth/sesion";
import { obtenerCarta } from "@/features/carta/carta";
import { agruparPorCategoria } from "@/features/carta/formato";
import { listarMesasConSesion } from "@/features/mesero/sesiones";
import { FormularioPedidoAsistido } from "./formulario-pedido-asistido";

async function PedidoAsistido() {
  const sesion = await requerirRol(["WAITER", "OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => ["WAITER", "OWNER", "ADMIN"].includes(m.rol));
  if (!membresia) return null;

  const [carta, mesas, locales] = await Promise.all([
    obtenerCarta(membresia.restaurantId),
    listarMesasConSesion(membresia.restaurantId),
    listarLocales(membresia.restaurantId),
  ]);

  // Solo se ofrecen mesas con sesión abierta: la base rechaza las demás.
  const mesasAbiertas = mesas
    .filter((mesa) => mesa.sesion !== null)
    .map((mesa) => ({ id: mesa.id, numero: mesa.numero }));

  return (
    <FormularioPedidoAsistido
      categorias={agruparPorCategoria(carta.categorias, carta.productos)}
      mesas={mesasAbiertas}
      locales={locales}
    />
  );
}

export default function PedidoAsistidoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/mesero" className="text-sm underline">
        ← Panel mesero
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Pedido asistido</h1>
      <p className="mt-1 text-zinc-700">
        Para clientes sin celular o que prefieren que el mesero tome su pedido.
      </p>
      <Suspense fallback={<p className="mt-6">Cargando carta…</p>}>
        <PedidoAsistido />
      </Suspense>
    </main>
  );
}
