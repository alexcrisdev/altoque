import { Suspense } from "react";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";

type Props = { params: Promise<{ token: string }> };

export default function PaginaQr({ params }: Props) {
  return (
    <main className="mx-auto max-w-md p-6">
      <Suspense fallback={<p>Cargando...</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: Props) {
  const { token } = await params;
  const acceso = await resolverAccesoQr(token);

  if (acceso.estado === "INVALIDO") {
    return (
      <Aviso
        titulo="Código QR no válido"
        mensaje="Este código no pertenece a ninguna mesa. Pide ayuda al personal."
      />
    );
  }

  if (acceso.estado === "DESHABILITADO") {
    return (
      <Aviso
        titulo="Mesa no disponible"
        mensaje="Esta mesa o este código QR está deshabilitado. Pide ayuda al personal."
      />
    );
  }

    return (
    <section className="space-y-2">
      <p className="text-sm text-gray-500">
        {acceso.restauranteNombre} · {acceso.localNombre}
      </p>
      <h1 className="text-2xl font-bold">
        {acceso.mesa ? `Mesa ${acceso.mesa.numero}` : "Pedido para llevar"}
      </h1>
      <p>Aquí irá la carta (US-004).</p>
    </section>
  );
}

function Aviso({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      <p>{mensaje}</p>
    </section>
  );
}