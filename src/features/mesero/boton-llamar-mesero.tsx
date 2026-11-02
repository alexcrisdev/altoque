"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "../../components/ui";
import { solicitarAyudaAction, type ResultadoAccionAyuda } from "./ayuda-actions";

export function BotonLlamarMesero({ token }: { token: string }) {
  const envioEnCurso = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [habilitarEn, setHabilitarEn] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [resultado, setResultado] = useState<ResultadoAccionAyuda | null>(null);

  useEffect(() => {
    if (!habilitarEn) return;
    const intervalo = window.setInterval(() => {
      const restantes = Math.max(0, Math.ceil((habilitarEn - Date.now()) / 1000));
      setSegundos(restantes);
      if (restantes === 0) window.clearInterval(intervalo);
    }, 1000);
    return () => window.clearInterval(intervalo);
  }, [habilitarEn]);

  async function llamar() {
    if (envioEnCurso.current || Date.now() < habilitarEn) return;
    envioEnCurso.current = true;
    setEnviando(true);
    setResultado(null);
    try {
      const respuesta = await solicitarAyudaAction(token);
      setResultado(respuesta);
      if (respuesta.ok) {
        setSegundos(60);
        setHabilitarEn(Date.now() + 60_000);
      }
    } catch {
      setResultado({ ok: false, mensaje: "No pudimos avisar al mesero. Revisa tu conexión e inténtalo otra vez." });
    } finally {
      envioEnCurso.current = false;
      setEnviando(false);
    }
  }

  return <div className="mt-3 space-y-2">
    <Boton type="button" onClick={llamar} disabled={enviando || segundos > 0}>
      {enviando ? "Avisando al mesero…" : segundos > 0 ? `Volver a llamar en ${segundos} s` : "Llamar al mesero"}
    </Boton>
    {resultado && <p role={resultado.ok ? "status" : "alert"} className={`text-sm ${resultado.ok ? "text-exito-texto" : "text-peligro-texto"}`}>
      {resultado.mensaje}
    </p>}
  </div>;
}
