"use client";

import { useEffect, useState } from "react";
import { Insignia } from "@/components/ui";
import { calcularTiempoRestante } from "./temporizador-pago";

export function TemporizadorPagoCliente({ limite, pagoPendiente }: { limite: string; pagoPendiente: boolean }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);

  if (pagoPendiente) {
    return <Insignia tono="aviso">Tu pago está por verificarse</Insignia>;
  }

  const tiempo = calcularTiempoRestante(limite, ahora);
  if (tiempo.vencido) {
    return <p role="status" className="font-semibold text-peligro-texto">Tu pedido venció sin pago. Puedes volver a pedir.</p>;
  }

  const minutos = Math.floor(tiempo.segundos / 60).toString().padStart(2, "0");
  const segundos = (tiempo.segundos % 60).toString().padStart(2, "0");
  return <Insignia tono="aviso">Tienes {minutos}:{segundos} para pagar</Insignia>;
}
