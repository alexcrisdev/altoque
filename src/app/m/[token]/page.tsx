import { Suspense } from "react";
import {
  EncabezadoPantalla,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { CartaRestaurante } from "@/features/carta/carta-restaurante";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarSesionAbierta } from "@/features/mesero/sesiones";
import { obtenerConfigParaLlevar } from "@/features/pedidos/para-llevar";
import { MisPedidos } from "@/features/pedidos/mis-pedidos";
import { BotonLlamarMesero } from "@/features/mesero/boton-llamar-mesero";
import { CuentaCliente } from "@/features/pago-cierre/cuenta-cliente";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
};

export default function PaginaQr({ params, searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:px-6">
      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando..."
          />
        }
      >
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params, searchParams }: Props) {
  const { token } = await params;
  const { pago, sesion } = await searchParams;
  const acceso = await resolverAccesoQr(token);

  if (acceso.estado === "INVALIDO") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-texto">Carta digital</h1>
        <MensajeEstado
          tipo="error"
          titulo="Código QR no válido"
          descripcion="Este código no pertenece a ninguna mesa. Pide ayuda al personal."
        />
      </section>
    );
  }

  if (acceso.estado === "DESHABILITADO") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-texto">Carta digital</h1>
        <MensajeEstado
          tipo="error"
          titulo="Mesa no disponible"
          descripcion="Esta mesa o este código QR está deshabilitado. Pide ayuda al personal."
        />
      </section>
    );
  }

  let sesionId: string | null = null;

  if (acceso.modalidad === "DINE_IN" && acceso.mesa) {
    const sesionAbierta = await buscarSesionAbierta(acceso.mesa.id);

    // La sesión siempre se obtiene en el servidor desde la mesa resuelta por el QR.
    // US-009 deberá resolverla otra vez en servidor; no confiar en un ID del navegador.
    sesionId = sesionAbierta?.id ?? null;
  }

  const paraLlevar = await obtenerConfigParaLlevar(
    acceso.restauranteId,
  );

  return (
    <section className="space-y-4">
      <EncabezadoPantalla
        titulo={
          acceso.mesa
            ? `Mesa ${acceso.mesa.numero}`
            : "Pedido para llevar"
        }
        subtitulo={`${acceso.restauranteNombre} · ${acceso.localNombre}`}
      />

      <MisPedidos token={token} />

      {/* US-076: saldo de la mesa y pago con tarjeta online. */}
      {sesionId !== null && <CuentaCliente token={token} clave={null} pago={pago} sesion={sesion} />}

      <Tarjeta>
        <p className="text-sm text-texto-suave">
          ¿Prefieres que te atiendan? Llama al mesero y él registra
          tu pedido desde su panel.
        </p>
        {(acceso.modalidad === "TAKEAWAY" || sesionId !== null) && <BotonLlamarMesero token={token} />}
      </Tarjeta>

      {acceso.modalidad === "DINE_IN" && !sesionId && (
        <MensajeEstado
          tipo="vacio"
          titulo="Esta mesa todavía no está habilitada"
          descripcion="Pide al mesero que la abra para poder hacer tu pedido. Para llamar al personal, levanta la mano o haz una señal al mesero."
        />
      )}

      <CartaRestaurante
        restauranteId={acceso.restauranteId}
        token={token}
        pedidosHabilitados={
          acceso.modalidad === "TAKEAWAY" || sesionId !== null
        }
        pedido={{
          modalidadQr: acceso.modalidad,
          mesaNumero: acceso.mesa?.numero ?? null,
          paraLlevar,
        }}
      />
    </section>
  );
}
