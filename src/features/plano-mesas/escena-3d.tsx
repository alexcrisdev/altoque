import { memo } from "react";
import { camara, maceta, mosaico, mueblesMesa, mueblesMostrador, paredes, sombras, type Asiento, type Cara } from "./maqueta";

export function ControlCamara({ grados, girar }: { grados: number; girar: (grados: number) => void }) {
  return <div className="maqueta-camara" role="group" aria-label="Cámara del mapa 3D">
    <button type="button" aria-label="Girar cámara a la izquierda" disabled={grados <= -36} onClick={() => girar(grados - 12)}>↶</button>
    <button type="button" aria-label="Restablecer cámara" title="Restablecer cámara" onClick={() => girar(24)}>Vista 3D</button>
    <button type="button" aria-label="Girar cámara a la derecha" disabled={grados >= 36} onClick={() => girar(grados + 12)}>↷</button>
  </div>;
}

type Props = { filas: number; grados: number; asientos: Asiento[]; mostrador?: boolean };
export const Escena3D = memo(function Escena3D({ filas, grados, asientos, mostrador = false }: Props) {
  const c = camara(filas, grados, mostrador);
  function poligono(f: Cara, i: number) {
    const puntos = f.vertices.map(v => {
      const p = c.proyectar(v);
      return p.x.toFixed(2) + "," + p.y.toFixed(2);
    }).join(" ");
    return <polygon key={i} points={puntos} fill={f.color} stroke={f.color} strokeWidth=".5" strokeLinejoin="round" />;
  }
  function profundidad(f: Cara) {
    return f.vertices.reduce((s, v) => s + c.distancia(v), 0) / f.vertices.length;
  }
  const muebles = asientos.flatMap(mueblesMesa);
  muebles.push(maceta(16, 15), maceta(c.ancho - 16, 15));
  muebles.sort((a, b) => c.distancia(a.centro) - c.distancia(b.centro));
  if (mostrador) muebles.push(...mueblesMostrador());
  const { ancho: w, fondo: d } = c;
  const lado = grados >= 0 ? w : 0;
  return <svg className="maqueta-dibujo" viewBox={`${c.izquierda} ${c.arriba} ${c.w} ${c.h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {poligono({ color: "var(--color-info-borde)", vertices: [[lado, 0, -8], [lado, d, -8], [lado, d, 0], [lado, 0, 0]] }, 0)}
    {poligono({ color: "var(--v2-coral-oscuro)", vertices: [[0, d, -8], [w, d, -8], [w, d, 0], [0, d, 0]] }, 1)}
    <g>{mosaico(c).map(poligono)}</g>
    <g opacity=".12">{sombras(asientos, mostrador).map(poligono)}</g>
    <g>{paredes(c).map(poligono)}</g>
    {muebles.map((m, i) => <g key={i}>
      {m.caras.sort((a, b) => profundidad(a) - profundidad(b)).map(poligono)}
    </g>)}
  </svg>;
}, (a, b) => a.grados === b.grados && a.filas === b.filas && a.mostrador === b.mostrador &&
  a.asientos.length === b.asientos.length && a.asientos.every((m, i) => m.celda === b.asientos[i].celda && m.estado === b.asientos[i].estado));
