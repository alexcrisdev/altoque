import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";

async function CocinaPanel() {
  await requerirRol(["KITCHEN", "OWNER", "ADMIN"]);
  return <main className="p-8"><h1 className="text-3xl font-bold">Panel cocina</h1><form action={cerrarSesion}><button className="mt-4 underline">Cerrar sesión</button></form></main>;
}

export default function CocinaPage() { return <Suspense fallback={<main className="p-8">Cargando panel…</main>}><CocinaPanel /></Suspense>; }
