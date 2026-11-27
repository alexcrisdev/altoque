import type { Metadata } from "next";
import "../../../../cliente.css";
import { Suspense } from "react";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import {
  BotonEnlace,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import {
  consultarPedidoCliente,
  type PedidoCliente,
} from "@/features/pedidos/estado-cliente-servidor";
import {
  etiquetaEstadoCliente,
  mensajeEstadoCliente,
} from "@/features/pedidos/estado-cliente";
import {
  LineaTiempoPedido,
  TicketPedido,
} from "@/features/pedidos/linea-tiempo-cliente";
import { CuentaCliente } from "@/features/pago-cierre/cuenta-cliente";
import { leerEleccionCaja } from "@/features/pago-cierre/pago-en-caja-datos";
import { AvisoEstadoCliente } from "@/features/pedidos/aviso-estado-cliente";
import { TemporizadorPagoCliente } from "@/features/pedidos/temporizador-pago-cliente";
import { consultarCalificacionAction } from "@/features/pedidos/calificacion-actions";
import { CalificacionPedido } from "@/features/pedidos/calificacion-pedido";
import { leerEdicionPedidoCliente } from "@/features/pedidos/edicion-cliente-datos";
import { EditarPedidoCliente } from "@/features/pedidos/editar-pedido-cliente";
import { mensajeErrorEdicionCliente } from "@/features/pedidos/edicion-cliente-logica";

export const metadata: Metadata = {
  title: "Estado de mi pedido | AlToque",
  robots: {
    index: false,
    follow: false,
  },
};

type Props = {
  params: Promise<{
    token: string;
    clave: string;
  }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
};

export default function PaginaEstadoPedido({ params, searchParams }: Props) {
  return (
    <main id="contenido-principal" className="experiencia-cliente seguimiento-cliente mx-auto w-full max-w-lg space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-texto">
        Estado de mi pedido
      </h1>

      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Consultando tu pedido..."
          />
        }
      >
        <ContenidoPedido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContenidoPedido({ params, searchParams }: Props) {
  const { token, clave } = await params;
  const { pago, sesion } = await searchParams;

  let pedido: PedidoCliente | null = null;
  let falloConsulta = false;

  try {
    pedido = await consultarPedidoCliente(token, clave);
  } catch {
    // No mostramos errores internos ni datos de la consulta.
    falloConsulta = true;
  }

  // La opinión no debe interrumpir la línea de tiempo si su consulta falla.
  const [calificacion, edicion, pagoEnCaja] = await Promise.all([
    pedido ? consultarCalificacionAction(token, clave).catch(() => null) : null,
    pedido?.estado === "PENDING" ? leerEdicionPedidoCliente(token, clave).catch(() => null) : null,
    pedido?.estado === "PENDING" ? leerEleccionCaja(token, clave).catch(() => null) : null,
  ]);

  return (
    <section className="space-y-4">
      {/* También reintenta cuando falla la consulta al servidor. */}
      <ActualizacionAutomatica segundos={5} />

      {/* Permanece montado durante errores transitorios para conservar el audio
          habilitado y recordar que este pedido ya fue notificado. */}
      <AvisoEstadoCliente
        key={`${token}/${clave}`}
        estado={pedido?.estado ?? null}
        modalidad={pedido?.modalidad ?? "DINE_IN"}
      />

      {falloConsulta ? (
        <MensajeEstado
          tipo="error"
          titulo="No pudimos actualizar. Reintentando…"
          descripcion="Conserva esta página abierta. Volveremos a consultar automáticamente."
        />
      ) : pedido ? (
        <>
          <ResumenPedido key={clave} pedido={pedido} limitePago={pagoEnCaja?.limitePago ?? pedido.limitePago} />
          {edicion && ("items" in edicion
            ? <EditarPedidoCliente key={`edicion-${clave}`} token={token} clave={clave} edicion={edicion} />
            : <p className="text-sm text-texto-suave">{mensajeErrorEdicionCliente(edicion.bloqueo)}</p>)}
          {calificacion?.disponible && !calificacion.calificada && (
            <CalificacionPedido key={`calificacion-${clave}`} token={token} clave={clave} />
          )}
          {/* US-094: una mesa usa su sesión; para llevar, su clave de pedido. */}
          <CuentaCliente
            token={token}
            clave={pedido.modalidad === "TAKEAWAY" ? clave : null}
            pago={pago}
            sesion={sesion}
            pagoEnCaja={pagoEnCaja ? { clave, estado: pagoEnCaja } : undefined}
          />
        </>
      ) : (
        <MensajeEstado
          tipo="error"
          titulo="No encontramos este pedido."
          descripcion="Vuelve a la carta escaneando el QR."
        />
      )}

      <BotonEnlace
        href={`/m/${encodeURIComponent(token)}`}
        variante="secundario"
        className="w-full"
      >
        Volver a la carta
      </BotonEnlace>
    </section>
  );
}

function ResumenPedido({ pedido, limitePago }: { pedido: PedidoCliente; limitePago: string }) {
  return (
    <>
      {/* US-092: ticket con número, tiempo estimado y barra de avance. */}
      <TicketPedido
        numero={pedido.numero}
        estadoTexto={etiquetaEstadoCliente(pedido.estado)}
        mensaje={mensajeEstadoCliente(pedido.estado, pedido.modalidad)}
        estimado={pedido.estimado}
        pasos={pedido.lineaTiempo}
        cancelado={pedido.estado === "CANCELLED"}
      />

      <Tarjeta className="space-y-6">
        <p className="text-sm text-texto-suave">
          {pedido.modalidad === "TAKEAWAY"
            ? "Pedido para llevar"
            : pedido.mesaNumero !== null
              ? `Consumo en mesa ${pedido.mesaNumero}`
              : "Consumo en el local"}
        </p>

        <LineaTiempoPedido pasos={pedido.lineaTiempo} />

        {pedido.estado === "CANCELLED" && (
          <div className="rounded-xl border border-peligro-borde bg-peligro-fondo p-4 text-peligro-texto">
            <p className="font-semibold">Motivo de cancelación</p>
            <p className="mt-1 whitespace-pre-line break-words">
              {pedido.motivo || "El restaurante no registró un motivo."}
            </p>
          </div>
        )}

        {pedido.estado === "PENDING" && (
          <TemporizadorPagoCliente limite={limitePago} pagoPendiente={pedido.pagoPendiente} />
        )}

        <section aria-labelledby="productos-del-pedido">
          <h3
            id="productos-del-pedido"
            className="mb-3 font-semibold"
          >
            Tu pedido
          </h3>

          <ul className="divide-y divide-borde">
            {pedido.items.map((item, indice) => (
              <li
                key={indice}
                className="flex items-start justify-between gap-4 py-3"
              >
                <span className="min-w-0 break-words">
                  {item.nombre}
                </span>

                <span className="shrink-0 font-semibold">
                  × {item.cantidad}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </Tarjeta>
    </>
  );
}
