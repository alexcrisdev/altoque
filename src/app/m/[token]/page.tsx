import "../../cliente.css";
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
import { Marca } from "@/components/marca";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
};

export default function PaginaQr({ params, searchParams }: Props) {
  return (
    <main id="contenido-principal" className="experiencia-cliente mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between border-b border-borde pb-3"><Marca /><span className="text-sm font-medium text-texto-suave">Carta digital</span></div>
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
      <div className="mov-acceso bienvenida-carta rounded-2xl border border-info-borde bg-info-fondo px-5 py-4">
        <h2 className="text-lg font-bold text-texto">¿Qué te provoca hoy?</h2>
        <details className="ayuda-discreta">
          <summary>Cómo pedir</summary>
          <p className="text-sm text-texto-suave">Explora los platos, toca uno para ver sus detalles y agrégalo a tu pedido.</p>
        </details>
      </div>

      <MisPedidos token={token} />

      {/* US-076: saldo de la mesa y pago con tarjeta online. */}
      {sesionId !== null && <CuentaCliente token={token} clave={null} pago={pago} sesion={sesion} />}

      <Tarjeta className="ayuda-mesero flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <details className="ayuda-discreta min-w-0">
          <summary>Atención con mesero</summary>
          <p className="text-sm text-texto-suave">
          ¿Prefieres que te atiendan? Llama al mesero y él registra
          tu pedido desde su panel.
          </p>
        </details>
        {(acceso.modalidad === "TAKEAWAY" || sesionId !== null) && <BotonLlamarMesero token={token} />}
      </Tarjeta>

      {/* US-036: el aviso «Pide al mesero que habilite tu mesa» lo muestra la carta y se
          actualiza solo cuando el mesero la habilita (sin recargar ni perder el carrito). */}
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
