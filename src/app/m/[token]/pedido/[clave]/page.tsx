import type { Metadata } from "next";
import { Suspense } from "react";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import {
  BotonEnlace,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import {
  consultarPedidoCliente,
  type PedidoCliente,
} from "@/features/pedidos/estado-cliente-servidor";
import {
  MENSAJE_ESTADO_CLIENTE,
  pasoDelPedido,
} from "@/features/pedidos/estado-cliente";
import {
  ETIQUETA_ESTADO,
  TONO_ESTADO,
} from "@/features/pedidos/estados";
import { CuentaCliente } from "@/features/pago-cierre/cuenta-cliente";

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
    <main className="mx-auto w-full max-w-lg space-y-6 px-4 py-6 sm:px-6">
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

  return (
    <section className="space-y-4">
      {/* También reintenta cuando falla la consulta al servidor. */}
      <ActualizacionAutomatica segundos={10} />

      {falloConsulta ? (
        <MensajeEstado
          tipo="error"
          titulo="No pudimos actualizar. Reintentando…"
          descripcion="Conserva esta página abierta. Volveremos a consultar automáticamente."
        />
      ) : pedido ? (
        <>
          <ResumenPedido pedido={pedido} />
          {/* US-076: pago con tarjeta online del pedido para llevar. */}
          {pedido.modalidad === "TAKEAWAY" && <CuentaCliente token={token} clave={clave} pago={pago} sesion={sesion} />}
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

function ResumenPedido({ pedido }: { pedido: PedidoCliente }) {
  const pasoActual = pasoDelPedido(pedido.estado);

  const pasos = [
    "Recibido",
    "Aceptado",
    "En preparación",
    pedido.estado === "DELIVERED" ? "Entregado" : "Listo",
  ];

  return (
    <Tarjeta className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          Pedido N.º {pedido.numero}
        </h2>

        <Insignia tono={TONO_ESTADO[pedido.estado]}>
          {ETIQUETA_ESTADO[pedido.estado]}
        </Insignia>
      </div>

      <div role="status" aria-atomic="true">
        <p className="text-xl font-semibold text-texto">
          {MENSAJE_ESTADO_CLIENTE[pedido.estado]}
        </p>
      </div>

      <p className="text-sm text-texto-suave">
        {pedido.modalidad === "TAKEAWAY"
          ? "Pedido para llevar"
          : pedido.mesaNumero !== null
            ? `Consumo en mesa ${pedido.mesaNumero}`
            : "Consumo en el local"}
      </p>

      {pasoActual !== null && (
        <section aria-label="Progreso del pedido">
          <ol className="grid grid-cols-4 gap-2">
            {pasos.map((etiqueta, indice) => {
              const numeroPaso = indice + 1;
              const alcanzado = numeroPaso <= pasoActual;
              const actual = numeroPaso === pasoActual;

              return (
                <li
                  key={numeroPaso}
                  aria-current={actual ? "step" : undefined}
                  className="min-w-0"
                >
                  <div
                    aria-hidden="true"
                    className={`mb-2 h-2 rounded-full ${
                      alcanzado ? "bg-marca" : "bg-borde"
                    }`}
                  />

                  <p
                    className={`break-words text-xs sm:text-sm ${
                      alcanzado
                        ? "font-semibold text-marca"
                        : "text-texto-suave"
                    }`}
                  >
                    {etiqueta}
                  </p>

                  <span className="sr-only">
                    {actual
                      ? "Paso actual"
                      : alcanzado
                        ? "Paso completado"
                        : "Paso pendiente"}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {pedido.estado === "CANCELLED" && (
        <div className="rounded-xl border border-peligro-borde bg-peligro-fondo p-4 text-peligro-texto">
          <p className="font-semibold">Motivo de cancelación</p>
          <p className="mt-1 whitespace-pre-line break-words">
            {pedido.motivo || "El restaurante no registró un motivo."}
          </p>
        </div>
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
  );
}
