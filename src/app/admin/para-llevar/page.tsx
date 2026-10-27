import Link from "next/link";
import { Suspense } from "react";
import { requerirRol } from "@/features/auth/sesion";
import { obtenerConfigParaLlevar } from "@/features/pedidos/para-llevar";
import { FormularioParaLlevar } from "./formulario-para-llevar";

async function ConfigParaLlevar() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return null;
  const config = await obtenerConfigParaLlevar(membresia.restaurantId);
  return <FormularioParaLlevar config={config} />;
}

export default function ParaLlevarPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline">
        ← Panel administrador
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Pedidos para llevar</h1>
      <Suspense fallback={<p className="mt-6">Cargando…</p>}>
        <ConfigParaLlevar />
      </Suspense>
    </main>
  );
}
