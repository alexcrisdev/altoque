"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Tarjeta } from "@/components/ui";
import { elegirPagoEnCajaAction } from "./pago-en-caja-actions";
import type { EleccionCaja } from "./pago-en-caja-datos";
import { centimosATexto } from "./pago-logica";

export function ElegirPagoEnCaja({ token, clave, estado }: { token: string; clave: string; estado: EleccionCaja }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [mensaje, setMensaje] = useState("");
  const [guardando, guardar] = useTransition();

  function elegir(valor: boolean) {
    setMensaje("");
    guardar(async () => {
      const resultado = await elegirPagoEnCajaAction(token, clave, valor);
      if (!resultado.ok) {
        setMensaje(resultado.mensaje);
        router.refresh();
        return;
      }
      dialogo.current?.close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {estado.solicitado ? (
        <>
          <p role="status" className="font-semibold">
            Acércate a caja y menciona tu pedido N.º {estado.numero} · Total S/ {centimosATexto(estado.saldoCentimos)}
          </p>
          <Boton type="button" variante="secundario" cargando={guardando} onClick={() => elegir(false)}>
            Elegir otra forma de pago
          </Boton>
        </>
      ) : estado.disponible && (
        <>
          <Boton type="button" variante="secundario" onClick={() => dialogo.current?.showModal()}>Pagar en caja</Boton>
          <dialog ref={dialogo} aria-labelledby={titulo} className="m-auto w-[min(24rem,calc(100%-2rem))] bg-transparent"
            onClose={() => setMensaje("")} onCancel={(evento) => { if (guardando) evento.preventDefault(); }}>
            <Tarjeta className="space-y-4">
              <h3 id={titulo} className="font-semibold">¿Quieres pagar en caja?</h3>
              <div className="flex flex-wrap gap-2">
                <Boton type="button" cargando={guardando} onClick={() => elegir(true)}>Sí</Boton>
                <Boton type="button" variante="secundario" disabled={guardando} onClick={() => dialogo.current?.close()}>
                  No
                </Boton>
              </div>
              {mensaje && <p role="alert" className="text-sm">{mensaje}</p>}
            </Tarjeta>
          </dialog>
        </>
      )}
      {estado.solicitado && mensaje && <p role="alert" className="text-sm">{mensaje}</p>}
    </div>
  );
}
