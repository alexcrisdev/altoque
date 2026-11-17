import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { Boton, EncabezadoPantalla, MensajeEstado } from "@/components/ui";
import { obtenerKds } from "@/features/cocina/kds-actions";
import { TableroKds } from "@/features/cocina/tablero-kds";

async function CocinaPanel({ searchParams }: PageProps<"/cocina">) {
  const inicial = await obtenerKds();
  const tv = (await searchParams).modo === "tv";
  return <main className="mx-auto min-h-screen w-full max-w-screen-2xl bg-[#111923] px-4 py-6 text-slate-100 sm:px-6">
    <EncabezadoPantalla titulo="Cocina" subtitulo="Pedidos de hoy · En orden de llegada"
      acciones={tv ? undefined : <form action={cerrarSesion}><Boton variante="secundario" type="submit">Cerrar sesión</Boton></form>} />
    <TableroKds key={inicial.restauranteId} inicial={inicial} tv={tv} />
  </main>;
}

export default function CocinaPage(props: PageProps<"/cocina">) {
  return <Suspense fallback={<main className="mx-auto min-h-screen max-w-7xl bg-[#111923] p-6 text-slate-100">
    <MensajeEstado tipo="cargando" titulo="Cargando cocina…" />
  </main>}><CocinaPanel {...props} /></Suspense>;
}
