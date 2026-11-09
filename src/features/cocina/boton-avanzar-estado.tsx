"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { cambiarEstadoPedido } from "@/features/pedidos/estado-actions";
import { mensajeErrorEstado, type EstadoPedido } from "@/features/pedidos/estados";
import { obtenerPanelCocina } from "./actions";
import { siguienteEstadoCocina, textoBotonCocina } from "./cocina-logica";
import { useAvisoCocina } from "./avisos-cocina";

export function BotonAvanzarEstado({ pedidoId, estado, numero }: {
  pedidoId: string; estado: EstadoPedido; numero: number;
}) {
  const router = useRouter();
  const [guardando, iniciarTransicion] = useTransition();
  const [error, setError] = useState("");
  const bloqueo = useRef(false);
  const avisar = useAvisoCocina();
  const siguiente = siguienteEstadoCocina(estado);
  const texto = textoBotonCocina(estado);
  if (!siguiente || !texto) return null;

  function guardar() {
    if (bloqueo.current || !siguiente) return;
    bloqueo.current = true;
    setError("");
    avisar?.("");
    iniciarTransicion(async () => {
      try {
        const resultado = await cambiarEstadoPedido(pedidoId, siguiente);
        if (resultado.ok) {
          router.refresh();
          return;
        }

        let mensaje = resultado.mensaje;
        let refrescar = false;
        if (mensaje === mensajeErrorEstado("INVALID_TRANSITION") || mensaje === mensajeErrorEstado("ORDER_NOT_FOUND")) {
          // La acción de escritura no cambia: esta lectura confirma qué pasó entre pestañas.
          try {
            const actual = await obtenerPanelCocina(pedidoId);
            if (actual.ok) {
              if (actual.estadoPedido === "CANCELLED") {
                mensaje = `El pedido N.º ${numero} fue cancelado. No se guardó el cambio. ${resultado.mensaje}`;
              }
              refrescar = actual.estadoPedido !== estado;
            }
          } catch {
            // Si falla la comprobación, conservar el mensaje original del rechazo.
          }
        }
        setError(mensaje);
        if (refrescar) {
          avisar?.(mensaje);
          router.refresh();
        }
      } catch {
        setError("No pudimos actualizar el pedido. Revisa tu conexión e inténtalo de nuevo.");
      } finally {
        bloqueo.current = false;
      }
    });
  }

  return <div className="mt-4">
    <Boton type="button" tamano="lg" className="w-full" disabled={guardando}
      aria-label={`${texto} el pedido N.º ${numero}`} onClick={guardar}>
      {guardando ? "Guardando…" : texto}
    </Boton>
    {error && <p role="alert" className="mt-2 text-sm text-peligro-texto">{error}</p>}
  </div>;
}
