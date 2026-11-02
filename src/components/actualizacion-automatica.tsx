"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function ActualizacionAutomatica({ segundos = 10 }: { segundos?: number }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [sinConexion, setSinConexion] = useState(false);
  const [transcurridos, setTranscurridos] = useState(0);
  const ultimaActualizacion = useRef(0);
  const actualizando = useRef(false);
  const intervalo = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 10_000;

  useEffect(() => {
    actualizando.current = pendiente;
    if (!pendiente) ultimaActualizacion.current = Date.now();
  }, [pendiente]);

  useEffect(() => {
    function actualizar() {
      if (document.visibilityState !== "visible" || actualizando.current) return;
      if (!navigator.onLine) { setSinConexion(true); return; }
      setSinConexion(false);
      actualizando.current = true;
      iniciarTransicion(() => router.refresh());
    }
    function sinRed() { setSinConexion(true); }
    function contar() {
      setTranscurridos(Math.max(0, Math.floor((Date.now() - ultimaActualizacion.current) / 1000)));
      setSinConexion(!navigator.onLine);
    }

    const refresco = window.setInterval(actualizar, intervalo);
    const reloj = window.setInterval(contar, 1000);
    document.addEventListener("visibilitychange", actualizar);
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", sinRed);
    return () => {
      window.clearInterval(refresco);
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", actualizar);
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", sinRed);
    };
  }, [router, intervalo]);

  return <p className="my-4 text-sm text-texto-suave">
    {sinConexion ? <span role="status">Sin conexión, reintentando…</span> : `Actualizado hace ${transcurridos} s`}
  </p>;
}