"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MensajeEstado } from "../../components/ui";
import { consultarPagoOnlineAction, type EstadoPagoOnline } from "./pago-online-actions";

const CADA_MS = 3000;
const ESPERA_MAXIMA_MS = 2 * 60 * 1000;

// US-076: al volver de Stripe se espera el webhook. Mientras no llegue, el pago
// no está confirmado, aunque Stripe haya mostrado «pagado».
export function EstadoPagoOnline({ token, clave, sesionStripe, rutaBase }: {
  token: string;
  clave: string | null;
  sesionStripe: string;
  rutaBase: string;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoPagoOnline | "TARDA">("PENDIENTE");

  useEffect(() => {
    let activo = true;
    const inicio = Date.now();
    let temporizador = 0;

    async function consultar() {
      let respuesta: EstadoPagoOnline = "PENDIENTE";
      try {
        respuesta = await consultarPagoOnlineAction(token, clave, sesionStripe);
      } catch {
        // Sin conexión: se vuelve a intentar.
      }
      if (!activo) return;
      if (respuesta === "CONFIRMADO") {
        setEstado("CONFIRMADO");
        router.refresh(); // Actualiza el saldo de la cuenta.
        return;
      }
      if (respuesta === "ERROR") {
        setEstado("ERROR");
        return;
      }
      if (Date.now() - inicio > ESPERA_MAXIMA_MS) setEstado("TARDA");
      temporizador = window.setTimeout(consultar, CADA_MS);
    }

    void consultar();
    return () => { activo = false; window.clearTimeout(temporizador); };
  }, [token, clave, sesionStripe, router]);

  if (estado === "CONFIRMADO") {
    return <div role="status" className="rounded-xl border border-exito-borde bg-exito-fondo p-4 text-exito-texto">
      <p className="font-semibold">¡Pago confirmado!</p>
      <p className="mt-1 text-sm">Stripe confirmó tu pago con tarjeta. Ya quedó registrado en caja.</p>
      <button type="button" className="mt-2 text-sm underline" onClick={() => router.replace(rutaBase)}>Entendido</button>
    </div>;
  }
  if (estado === "ERROR") {
    return <MensajeEstado tipo="error" titulo="No pudimos revisar tu pago"
      descripcion="Si Stripe te mostró el pago como aprobado, muéstraselo al personal: lo verán en caja." />;
  }
  return <MensajeEstado tipo="cargando" titulo="Procesando pago…"
    descripcion={estado === "TARDA"
      ? "Está tardando más de lo normal. No vuelvas a pagar: si Stripe lo aprobó, aparecerá aquí en unos minutos o puedes consultarlo con el personal."
      : "Estamos esperando la confirmación de Stripe. No cierres esta página."} />;
}
