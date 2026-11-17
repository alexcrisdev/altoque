"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Boton, Tarjeta } from "../../components/ui";
import { calificarPedidoAction } from "./calificacion-actions";
import { claveCierreCalificacion, resolverDecisionCalificacion } from "./calificacion-cliente";

function suscribirCierre(actualizar: () => void) {
  window.addEventListener("storage", actualizar);
  window.addEventListener("altoque:calificacion", actualizar);
  return () => {
    window.removeEventListener("storage", actualizar);
    window.removeEventListener("altoque:calificacion", actualizar);
  };
}

function Estrellas({ titulo, valor, cambiar }: { titulo: string; valor: number; cambiar: (valor: number) => void }) {
  const id = useId();
  return <fieldset>
    <legend className="text-sm font-semibold">{titulo}</legend>
    <div className="mt-1 flex gap-1">
      {[1, 2, 3, 4, 5].map((numero) => <label key={numero} className="cursor-pointer">
        <input className="peer sr-only" type="radio" name={id} value={numero} checked={valor === numero}
          aria-label={`${numero} ${numero === 1 ? "estrella" : "estrellas"} para ${titulo.toLowerCase()}`}
          onChange={() => cambiar(numero)} required />
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-lg text-3xl text-aviso-texto peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-texto">
          {numero <= valor ? "★" : "☆"}
        </span>
      </label>)}
    </div>
  </fieldset>;
}

export function CalificacionPedido({ token, clave }: { token: string; clave: string }) {
  const [cerrada, setCerrada] = useState(false);
  const [servicio, setServicio] = useState(0);
  const [mesero, setMesero] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const ocupado = useRef(false);
  const idComentario = useId();
  const oculta = useSyncExternalStore(suscribirCierre, () => {
    try { return localStorage.getItem(claveCierreCalificacion(clave)) === "1"; } catch { return false; }
  }, () => false);

  function recordar() {
    setCerrada(true);
    try { localStorage.setItem(claveCierreCalificacion(clave), "1"); } catch { /* El cierre sigue funcionando en memoria. */ }
    window.dispatchEvent(new Event("altoque:calificacion"));
  }

  if (cerrada || oculta) return null;

  return <Tarjeta className="relative space-y-4" role="region" aria-label="Calificación opcional">
    <button type="button" aria-label="Cerrar calificación sin enviar" onClick={() => {
      void resolverDecisionCalificacion({ tipo: "cerrar" }, recordar, (datos) => calificarPedidoAction(token, clave, datos));
    }} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-texto-suave" disabled={enviando}>×</button>
    <div className="pr-10">
      <h2 className="text-lg font-bold">¿Qué tal te atendimos?</h2>
      <p className="text-sm text-texto-suave">Tu opinión es opcional. Puedes cerrar esta tarjeta sin calificar.</p>
    </div>
    <form className="space-y-4" onSubmit={async (evento) => {
      evento.preventDefault();
      if (ocupado.current) return;
      ocupado.current = true;
      setEnviando(true);
      setMensaje("");
      try {
        const resultado = await resolverDecisionCalificacion({ tipo: "guardar", datos: { servicio, mesero, comentario } }, recordar,
          (datos) => calificarPedidoAction(token, clave, datos));
        if (resultado?.ok || (resultado && !resultado.ok && resultado.repetida)) recordar();
        else if (resultado && !resultado.ok) setMensaje(resultado.mensaje);
      } catch { setMensaje("No pudimos enviar tu opinión. Inténtalo de nuevo."); }
      finally { ocupado.current = false; setEnviando(false); }
    }}>
      <fieldset disabled={enviando} className="space-y-3">
        <legend className="sr-only">Califica tu experiencia</legend>
        <Estrellas titulo="Servicio" valor={servicio} cambiar={setServicio} />
        <Estrellas titulo="Mesero" valor={mesero} cambiar={setMesero} />
        <label htmlFor={idComentario} className="block text-sm font-semibold">Comentario (opcional)</label>
        <textarea id={idComentario} value={comentario} maxLength={200} rows={3}
          onChange={(evento) => setComentario(evento.target.value)}
          className="w-full rounded-xl border border-borde bg-superficie p-3 text-texto" />
        <p className="text-xs text-texto-suave">Máximo 200 caracteres, sin saltos de línea.</p>
      </fieldset>
      {mensaje && <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p>}
      <Boton type="submit" disabled={enviando || !servicio || !mesero} className="w-full">{enviando ? "Enviando…" : "Enviar opinión"}</Boton>
    </form>
  </Tarjeta>;
}
