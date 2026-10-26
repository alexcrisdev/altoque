import { Suspense } from "react";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";

async function MeseroPanel() {
  await requerirRol(["WAITER", "OWNER", "ADMIN"]);
  return <main className="p-8"><h1 className="text-3xl font-bold">Panel mesero</h1><form action={cerrarSesion}><button className="mt-4 underline">Cerrar sesión</button></form></main>;
}

export default function MeseroPage() { return <Suspense fallback={<main className="p-8">Cargando panel…</main>}><MeseroPanel /></Suspense>; }
