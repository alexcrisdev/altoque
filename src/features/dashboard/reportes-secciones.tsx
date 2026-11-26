"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./reportes-secciones.css";

type Props = {
  ventas: ReactNode;
  tendencias: ReactNode;
  mapaCalor: ReactNode;
  cocina: ReactNode;
};

export function ReportesSecciones({ ventas, tendencias, mapaCalor, cocina }: Props) {
  const id = useId();
  const [activa, setActiva] = useState(0);
  const [mapaVisitado, visitarMapa] = useState(false);
  function seleccionar(indice: number) {
    setActiva(indice);
    if (indice === 2) visitarMapa(true);
  }
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const secciones = [
    { titulo: "Ventas", contenido: ventas },
    { titulo: "Tendencias", contenido: tendencias },
    { titulo: "Mapa de calor", contenido: mapaCalor },
    { titulo: "Cocina", contenido: cocina },
  ];

  function navegar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let destino: number;
    switch (evento.key) {
      case "ArrowRight": destino = (indice + 1) % secciones.length; break;
      case "ArrowLeft": destino = (indice + secciones.length - 1) % secciones.length; break;
      case "Home": destino = 0; break;
      case "End": destino = secciones.length - 1; break;
      default: return;
    }
    evento.preventDefault();
    seleccionar(destino);
    botones.current[destino]?.focus();
  }

  return (
    <div className="reportes-secciones">
      <div role="tablist" aria-label="Secciones de reportes" className="reportes-pestanas">
        {secciones.map(({ titulo }, indice) => (
          <button
            key={titulo}
            ref={(elemento) => { botones.current[indice] = elemento; }}
            id={`${id}-pestana-${indice}`}
            type="button"
            role="tab"
            aria-selected={activa === indice}
            tabIndex={activa === indice ? 0 : -1}
            onClick={() => seleccionar(indice)}
            onKeyDown={(evento) => navegar(evento, indice)}
            className="reportes-pestana"
          >
            {titulo}
          </button>
        ))}
      </div>

      {secciones.map(({ titulo, contenido }, indice) => (
        <div
          key={titulo}
          role="tabpanel"
          aria-labelledby={`${id}-pestana-${indice}`}
          hidden={activa !== indice}
          tabIndex={activa === indice ? 0 : undefined}
          className="mov-fundido reportes-panel"
        >
          {indice !== 2 || mapaVisitado ? contenido : null}
        </div>
      ))}
    </div>
  );
}
