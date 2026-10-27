import { Suspense } from "react";
import Link from "next/link";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";

async function AdminPanel() {
  await requerirRol(["OWNER", "ADMIN"]);
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Panel administrador</h1>
      <Link href="/admin/mesas" className="mt-4 block underline">
        Mesas y códigos QR
      </Link>
      <Link href="/admin/productos" className="mt-4 block underline">
        Administrar productos
      </Link>
      <Link href="/admin/para-llevar" className="mt-4 block underline">
        Pedidos para llevar
      </Link>
      <form action={cerrarSesion}>
        <button className="mt-4 underline">Cerrar sesión</button>
      </form>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<main className="p-8">Cargando panel…</main>}>
      <AdminPanel />
    </Suspense>
  );
}
