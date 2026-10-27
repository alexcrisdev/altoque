import { Suspense } from "react";
import { CartaRestaurante } from "@/features/carta/carta-restaurante";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarSesionAbierta } from "@/features/mesero/sesiones";

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

  let sesionId: string | null = null;
  if (acceso.modalidad === "DINE_IN" && acceso.mesa) {
    const sesionAbierta = await buscarSesionAbierta(acceso.mesa.id);
    // La sesión siempre se obtiene en el servidor desde la mesa resuelta por el QR.
    // US-009 deberá resolverla otra vez en servidor; no confiar en un ID del navegador.
    sesionId = sesionAbierta?.id ?? null;
  }

  return (
    <section className="space-y-2">
      <p className="text-sm text-gray-500">
        {acceso.restauranteNombre} · {acceso.localNombre}
      </p>
      <h1 className="text-2xl font-bold">
        {acceso.mesa ? `Mesa ${acceso.mesa.numero}` : "Pedido para llevar"}
      </h1>
      <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">
        ¿Prefieres que te atiendan? Llama al mesero y él registra tu pedido desde su panel.
      </p>
      {acceso.modalidad === "DINE_IN" && !sesionId && (
        <Aviso
          titulo="Esta mesa todavía no está habilitada"
          mensaje="Pide al mesero que la abra para poder hacer tu pedido. Para llamar al personal, levanta la mano o haz una señal al mesero."
        />
      )}
      <CartaRestaurante
        restauranteId={acceso.restauranteId}
        token={token}
        pedidosHabilitados={acceso.modalidad === "TAKEAWAY" || sesionId !== null}
      />
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
