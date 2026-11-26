"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition, type PointerEvent, type ReactNode } from "react";
import { Boton, clasesBoton } from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import { guardarPlanoMesasAction } from "./actions";
import { columnas, distribuirMesas, moverMesa, type Posiciones } from "./distribucion";
import { etiquetas, type MesaPlano } from "./preparar-plano";
import { FichaPlano } from "./vistas-plano";
import { ControlCamara, Escena3D } from "./escena-3d";
import { camara, centroCelda } from "./maqueta";
import "./plano-mesas.css";

type Props = { restauranteId: string; mesas: MesaPlano[]; puedeEditar: boolean; detalles?: Record<string, ReactNode> };

function EstadoMesa({ mesa }: { mesa: MesaPlano }) {
  return <span className="plano-estado" data-estado={mesa.estado}>{etiquetas[mesa.estado]}</span>;
}

export function PlanoMesas(props: Props) {
  const locales = new Map(props.mesas.map(m => [m.localId, m.local]));
  const [elegido, elegir] = useState("");
  const localId = locales.has(elegido) ? elegido : props.mesas[0]?.localId;
  if (!localId) return null;
  return <div className="plano">
    {locales.size > 1 && <label className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
      Local <select value={localId} onChange={e => elegir(e.target.value)}>
        {Array.from(locales, ([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
      </select>
    </label>}
    <Salon key={props.restauranteId + localId} {...props} localId={localId} mesas={props.mesas.filter(m => m.localId === localId)} />
  </div>;
}

function Salon({ mesas, localId, puedeEditar, detalles }: Props & { localId: string }) {
  const guardado: Posiciones = Object.fromEntries(mesas.flatMap(m => m.celda === null ? [] : [[m.id, m.celda]]));
  const ids = mesas.map(m => m.id);
  const [edicion, editar] = useState<{ base: Posiciones; posiciones: Posiciones } | null>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const posiciones = distribuirMesas(ids, JSON.stringify(edicion?.posiciones ?? guardado), "");
  const ocupadas = new Set(Object.values(posiciones));
  const [elegida, elegir] = useState<string | null>(null);
  const [vistaPrevia, previsualizar] = useState<string | null>(null);
  const [ficha, abrirFicha] = useState<string | null>(null);
  const [destino, indicarDestino] = useState<number | null>(null);
  const [mensaje, avisar] = useState("");
  const [grados, girar] = useState(24);
  const [pagina, irAPagina] = useState(0);
  const tablero = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; x: number; y: number; movido: boolean } | null>(null);
  const omitirClick = useRef(false);
  const invocador = useRef<HTMLButtonElement | null>(null);
  const prefijo = useId();
  const activa = mesas.find(m => m.id === ficha);
  const filasOcupadas = Math.ceil((Math.max(...ocupadas) + 1) / columnas);
  const filas = Math.max(2, filasOcupadas, Math.ceil(ids.length / columnas) + (edicion ? 1 : 0));
  const paginas = Math.ceil(filas / 3);
  const paginaActual = Math.min(pagina, paginas - 1);
  const inicio = paginaActual * 3 * columnas;
  const filasVisibles = Math.min(3, filas - paginaActual * 3);
  const visibles = mesas.filter(m => posiciones[m.id] >= inicio && posiciones[m.id] < inicio + filasVisibles * columnas);
  const c = camara(filasVisibles, grados);

  function abrir(mesa: MesaPlano, boton: HTMLButtonElement) {
    invocador.current = boton;
    previsualizar(null);
    abrirFicha(mesa.id);
  }
  function mover(id: string, celda: number) {
    if (!edicion || celda < 0 || celda >= filas * columnas) return;
    editar({ ...edicion, posiciones: moverMesa(posiciones, id, celda) });
    irAPagina(Math.floor(celda / (columnas * 3)));
    avisar(`Mesa ${mesas.find(m => m.id === id)?.numero}, fila ${Math.floor(celda / columnas) + 1}, columna ${celda % columnas + 1}.`);
  }
  function celdaBajoCursor(e: PointerEvent<HTMLButtonElement>) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-celda]");
    if (el && tablero.current?.contains(el) && el.dataset.celda !== String(posiciones[arrastre.current?.id ?? ""])) return Number(el.dataset.celda);
    const rect = tablero.current?.getBoundingClientRect();
    if (!rect) return null;
    const celda = c.celdaEnSuelo((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    return celda === null ? null : inicio + celda;
  }
  function guardar() {
    if (!edicion || guardando) return;
    const { base } = edicion;
    iniciarGuardado(async () => {
      try {
        const resultado = await guardarPlanoMesasAction(localId, posiciones, base);
        if (!resultado.ok) { avisar(resultado.mensaje); return; }
        editar(null);
        elegir(null);
        avisar("Plano guardado para todo el restaurante.");
      } catch { avisar("No se pudo guardar el plano. Tus cambios siguen en edición."); }
    });
  }

  return <>
    <div className="plano-cabecera">
      <div><h3>{mesas[0].local}</h3><span>{mesas.length} {mesas.length === 1 ? "mesa" : "mesas"}</span></div>
      <ControlCamara grados={grados} girar={girar} />
      {puedeEditar && (edicion ? <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" disabled={guardando} onClick={() => { editar(null); elegir(null); avisar(""); }}>Cancelar</Boton>
        <Boton disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar plano"}</Boton>
      </div> : <Boton variante="secundario" onClick={() => {
        editar({ base: guardado, posiciones }); avisar(""); previsualizar(null);
      }}>Editar plano</Boton>)}
    </div>
    {edicion && <p className="plano-instruccion">Arrastra una mesa o tócala y elige una casilla. Con teclado, usa las flechas.</p>}
    <div className="plano-suelo" style={{aspectRatio: c.w / c.h}} data-editando={!!edicion} ref={tablero}
      onKeyDown={e => { if (e.key === "Escape") { previsualizar(null); elegir(null); } }}>
      <Escena3D filas={filasVisibles} grados={grados} asientos={visibles.map(m => ({ celda: posiciones[m.id]-inicio, estado: m.estado }))} />
      {edicion && Array.from({ length: filasVisibles * columnas }, (_, indice) => {
        const celda = inicio + indice;
        if (ocupadas.has(celda)) return null;
        return <button key={celda} type="button" className="plano-celda" style={c.posicion(centroCelda(indice, 0))} data-celda={celda}
          data-destino={destino === celda} aria-disabled={!elegida} aria-label={`Mover a fila ${Math.floor(celda / columnas) + 1}, columna ${celda % columnas + 1}`}
          onClick={() => { if (elegida) mover(elegida, celda); elegir(null); }}>+</button>;
      })}
      {visibles.map(mesa => {
        const celda = posiciones[mesa.id];
        const estilo = c.posicion(centroCelda(celda - inicio));
        const previa = !edicion && !activa && vistaPrevia === mesa.id;
        return <div className="plano-puesto" key={mesa.id} data-celda={celda} data-columna={Math.floor(parseFloat(estilo.left)*3/100)}
          data-destino={destino === celda}
          data-previa={previa} data-estado={mesa.estado}
          style={{...estilo, width: `max(44px, ${56 / c.w * 100}%)`}}
          onPointerEnter={e => { if (!edicion && e.pointerType === "mouse") previsualizar(mesa.id); }}
          onPointerLeave={() => previsualizar(null)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) previsualizar(null); }}>
          <button type="button" className="plano-mesa" aria-label={`Mesa ${mesa.numero}, ${etiquetas[mesa.estado]}`}
            aria-pressed={edicion ? elegida === mesa.id : undefined} aria-haspopup={edicion ? undefined : "dialog"}
            aria-describedby={previa ? prefijo + mesa.id : undefined}
            onFocus={e => { if (!edicion && e.currentTarget.matches(":focus-visible")) previsualizar(mesa.id); }}
            onClick={e => {
              if (omitirClick.current && e.detail !== 0) { omitirClick.current = false; return; }
              if (!edicion) { abrir(mesa, e.currentTarget); return; }
              if (elegida && elegida !== mesa.id) { mover(elegida, celda); elegir(null); }
              else elegir(elegida === mesa.id ? null : mesa.id);
            }}
            onKeyDown={e => {
              if (!edicion) return;
              const pasos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columnas, ArrowDown: columnas };
              if (!(e.key in pasos)) return;
              e.preventDefault();
              if ((e.key === "ArrowLeft" && celda % columnas === 0) || (e.key === "ArrowRight" && celda % columnas === columnas - 1)) return;
              mover(mesa.id, celda + pasos[e.key]);
              requestAnimationFrame(() => tablero.current?.querySelector<HTMLButtonElement>(`[data-celda="${celda + pasos[e.key]}"] .plano-mesa`)?.focus());
            }}
            onPointerDown={e => {
              omitirClick.current = false;
              if (!edicion || e.button !== 0 || !e.isPrimary) return;
              arrastre.current = { id: mesa.id, x: e.clientX, y: e.clientY, movido: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
              const gesto = arrastre.current;
              if (!gesto || gesto.id !== mesa.id || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              if (!gesto.movido && Math.hypot(e.clientX - gesto.x, e.clientY - gesto.y) < 5) return;
              gesto.movido = true;
              e.currentTarget.dataset.arrastrando = "true";
              e.currentTarget.style.transform = `translate(${e.clientX - gesto.x}px, ${e.clientY - gesto.y}px)`;
              indicarDestino(celdaBajoCursor(e));
            }}
            onPointerUp={e => {
              if (!arrastre.current?.movido) return;
              const nueva = celdaBajoCursor(e);
              if (nueva !== null) mover(mesa.id, nueva);
              omitirClick.current = true;
              elegir(null);
            }}
            onLostPointerCapture={e => {
              e.currentTarget.style.removeProperty("transform");
              delete e.currentTarget.dataset.arrastrando;
              arrastre.current = null;
              indicarDestino(null);
            }}>
            <span className="plano-tablero-mesa"><strong>{mesa.numero}</strong></span>
            <span className="plano-marca-estado" aria-hidden="true" />
          </button>
          {previa && <aside className="plano-previa" aria-label={`Vista previa de Mesa ${mesa.numero}`}>
            <strong>Mesa {mesa.numero}</strong>
            <span id={prefijo + mesa.id}>{mesa.local} · {etiquetas[mesa.estado]}</span>
            {mesa.qr && <span>{mesa.activa && "Activa · "}{mesa.qr}</span>}
            {mesa.saldo !== null && <span>Saldo {formatearPrecio(mesa.saldo / 100)}</span>}
            <button type="button" onClick={e => {
              const boton = e.currentTarget.closest(".plano-puesto")?.querySelector<HTMLButtonElement>(".plano-mesa");
              if (boton) abrir(mesa, boton);
            }}>Abrir ficha</button>
          </aside>}
        </div>;
      })}
    </div>
    {paginas > 1 && <div className="plano-paginacion">
      <Boton variante="secundario" disabled={paginaActual === 0} onClick={() => irAPagina(paginaActual - 1)}>Anterior</Boton>
      <span aria-live="polite">Filas {paginaActual * 3 + 1}–{paginaActual * 3 + filasVisibles} de {filas}</span>
      <Boton variante="secundario" disabled={paginaActual + 1 === paginas} onClick={() => irAPagina(paginaActual + 1)}>Siguiente</Boton>
    </div>}
    <div className="plano-leyenda" aria-label="Estados de las mesas">
      {Object.entries(etiquetas).map(([estado, etiqueta]) => <span key={estado} className="plano-estado" data-estado={estado}>{etiqueta}</span>)}
    </div>
    <p role="status" className={mensaje ? `plano-instruccion ${edicion ? "" : "mov-fundido"}` : "sr-only"}>{mensaje}</p>
    <FichaPlano abierta={!!activa} local={activa?.local ?? ""} titulo={activa ? `Mesa ${activa.numero}` : ""}
      cerrar={() => { abrirFicha(null); invocador.current?.focus({ preventScroll: true }); }}>
      {activa && <div key={activa.id} className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3"><EstadoMesa mesa={activa} />{activa.qr && <span>{activa.qr}</span>}</div>
        {detalles?.[activa.id]}
        {activa.href || activa.saldo !== null ? <div className="plano-cuenta">
          {activa.saldo !== null && <div><small>Saldo</small><strong>{formatearPrecio(activa.saldo / 100)}</strong></div>}
          {activa.href && <Link className={clasesBoton(detalles ? "secundario" : "primario", "md")} href={activa.href}>Abrir cuenta</Link>}
        </div> : !detalles && <p>Sin cuenta abierta</p>}
      </div>}
    </FichaPlano>
  </>;
}
