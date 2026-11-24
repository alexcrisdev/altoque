"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { FichaPlano } from "@/features/plano-mesas/vistas-plano";
import { ControlCamara, Escena3D } from "@/features/plano-mesas/escena-3d";
import { camara } from "@/features/plano-mesas/maqueta";

type Estacion = { id: string; local: string; activo: boolean; controles: ReactNode };

export function PlanoMostrador({ estaciones }: { estaciones: Estacion[] }) {
  const [seleccion, seleccionar] = useState("");
  const [grados, girar] = useState(24);
  const [previa, mostrarPrevia] = useState(false);
  const [abierta, abrir] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const estacion = estaciones.find(e => e.id === seleccion) ?? estaciones[0];
  if (!estacion) return null;
  const estado = estacion.activo ? "QR activo" : "Sin QR";
  const c = camara(1, grados, true);

  return <div className="plano">
    <div className="plano-cabecera">
      {estaciones.length > 1 ? <label className="grid gap-1 text-sm font-semibold">Local
        <select value={estacion.id} onChange={e => { seleccionar(e.target.value); mostrarPrevia(false); }}>
          {estaciones.map(item => <option key={item.id} value={item.id}>{item.local}</option>)}
        </select>
      </label> : <h3>{estacion.local}</h3>}
      <ControlCamara grados={grados} girar={girar} />
    </div>
    <div className="plano-suelo" style={{aspectRatio: c.w/c.h}} onKeyDown={e => { if (e.key === "Escape") mostrarPrevia(false); }}>
      <Escena3D filas={1} grados={grados} asientos={[]} mostrador />
      <div className="plano-puesto puesto-retiro" style={c.posicion([150,103,32])} data-estado={estacion.activo ? "libre" : "espera"}
        data-previa={previa && !abierta}
        onPointerEnter={e => { if (e.pointerType === "mouse") mostrarPrevia(true); }}
        onPointerLeave={() => mostrarPrevia(false)}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) mostrarPrevia(false); }}>
        <button ref={boton} type="button" className="estacion-retiro" aria-haspopup="dialog"
          aria-label={`Mostrador de ${estacion.local}, ${estado}`} aria-describedby={previa && !abierta ? id : undefined}
          onClick={() => { mostrarPrevia(false); abrir(true); }}
          onFocus={e => { if (e.currentTarget.matches(":focus-visible")) mostrarPrevia(true); }}>
          <strong>Mostrador</strong>
          <span className="plano-marca-estado" aria-hidden="true" />
        </button>
        {previa && !abierta && <aside className="plano-previa">
          <strong>{estacion.local}</strong><span id={id}>Para llevar · {estado}</span>
          <button type="button" onClick={() => abrir(true)}>Abrir ficha</button>
        </aside>}
      </div>
    </div>
    <div className="plano-leyenda"><span className="plano-estado" data-estado={estacion.activo ? "libre" : "espera"}>{estado}</span></div>
    <FichaPlano abierta={abierta} cerrar={() => { abrir(false); boton.current?.focus({ preventScroll: true }); }} titulo="Mostrador" local={estacion.local}>
      <span className="plano-estado" data-estado={estacion.activo ? "libre" : "espera"}>{estado}</span>
      {estacion.controles}
    </FichaPlano>
  </div>;
}
