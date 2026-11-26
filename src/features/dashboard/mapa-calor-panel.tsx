"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boton, Tarjeta } from "@/components/ui";
import { consultarMapaCalorAction } from "./mapa-calor-actions";
import { leerPedidosSinteticos } from "./mapa-calor-csv";
import { calcularMapaCalor, DIAS_MAPA, resumenFranjas, type FiltroMapa, type FranjaMapa } from "./mapa-calor-logica";
import "./mapa-calor.css";

type Demo = ReturnType<typeof leerPedidosSinteticos>;
type Ajustes = Pick<FiltroMapa, "horaDesde" | "horaHasta" | "diasAbiertos" | "productoId">;
const inicial: Ajustes = { horaDesde: 11, horaHasta: 22, diasAbiertos: DIAS_MAPA.map((_, i) => i) };
const etiquetas = ["Nada", "Poco", "Medio", "Alto", "Pico"];

function fechaRelativa(fecha: string, dias: number) {
  const valor = new Date(fecha + "T12:00:00Z");
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

function descripcion(c: FranjaMapa) {
  return `${DIAS_MAPA[c.dia]} ${c.hora}:00 · ${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"} en ${c.diasEnRango} ${c.diasEnRango === 1 ? "fecha" : "fechas"} de atención`;
}

function Cuadricula({ celdas }: { celdas: FranjaMapa[] }) {
  const [detalle, mostrar] = useState("");
  const horas = celdas.filter(c => c.dia === 0).map(c => c.hora);
  const pico = Math.max(...celdas.map(c => c.promedio));
  return <>
    <div className="mapa-tabla" role="region" aria-label="Pedidos por día y hora, tabla desplazable" tabIndex={0}>
      <table>
        <caption className="sr-only">Pedidos por día y hora de Lima. La intensidad indica el promedio por fecha de atención.</caption>
        <thead><tr><th scope="col">Día</th>{horas.map(h => <th scope="col" key={h}>{h}:00</th>)}</tr></thead>
        <tbody>{DIAS_MAPA.map((dia, i) => <tr key={dia}><th scope="row">{dia}</th>
          {celdas.filter(c => c.dia === i).map(c => {
            const nivel = c.promedio === 0 ? 0 : c.promedio === pico ? 4 : Math.ceil(3 * c.promedio / pico);
            return <td key={c.hora}>{c.diasEnRango ? <button type="button" className="mapa-celda" data-nivel={nivel}
              aria-label={descripcion(c)} onFocus={() => mostrar(descripcion(c))}
              onMouseEnter={() => mostrar(descripcion(c))} onClick={() => mostrar(descripcion(c))} /> :
              <span aria-label="Sin fechas de atención">—</span>}</td>;
          })}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-3 text-sm" aria-label="Intensidad del mapa">{etiquetas.map((e,i) =>
      <span key={e}><i aria-hidden="true" className="mapa-muestra" data-nivel={i} /> {e}</span>)}</div>
    <p className="min-h-6 text-sm">{detalle || "Toca o enfoca una celda para ver los pedidos."}</p>
  </>;
}

function Vista({ demo }: { demo?: Demo }) {
  const [dias, periodo] = useState(28);
  const [ajustes, aplicar] = useState(inicial);
  const [confirmado, confirmar] = useState(false);
  const [errorFiltro, avisar] = useState("");
  const [intento, reintentar] = useState(0);
  const hasta = demo?.hasta ?? fechaRelativa(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), -1);
  const desde = fechaRelativa(hasta, 1 - dias);
  const filtro = useMemo(() => ({ ...ajustes, desde, hasta }), [ajustes, desde, hasta]);
  const [consulta, guardar] = useState<{ filtro: FiltroMapa; intento: number; respuesta: Awaited<ReturnType<typeof consultarMapaCalorAction>> }>();
  useEffect(() => {
    if (demo) return;
    let vigente = true;
    const timer = setTimeout(async () => {
      try {
        const respuesta = await consultarMapaCalorAction(filtro);
        if (vigente) guardar({ filtro, intento, respuesta });
      } catch {
        if (vigente) guardar({ filtro, intento, respuesta: { ok: false, mensaje: "No pudimos cargar el mapa." } });
      }
    }, 0);
    return () => { vigente = false; clearTimeout(timer); };
  }, [filtro, demo, intento]);
  const sintetico = useMemo(() => demo && calcularMapaCalor(demo.pedidos, filtro), [demo, filtro]);
  const respuesta = consulta?.filtro === filtro && consulta.intento === intento ? consulta.respuesta : undefined;
  const mapa = sintetico ?? (respuesta?.ok ? respuesta.mapa : undefined);
  const productos = demo?.productos ?? (consulta?.respuesta.ok ? consulta.respuesta.mapa.productos : []);
  const resumen = mapa && resumenFranjas(mapa.celdas);

  function guardarAjustes(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const horaDesde = Number(datos.get("inicio")), horaHasta = Number(datos.get("fin"));
    const diasAbiertos = datos.getAll("dia").map(Number);
    if (horaDesde >= horaHasta || !diasAbiertos.length) { avisar("Selecciona al menos un día y una hora de cierre posterior a la apertura."); return; }
    avisar("");
    confirmar(datos.has("confirmado"));
    aplicar({ horaDesde, horaHasta, diasAbiertos, productoId: String(datos.get("plato") || "") || undefined });
  }

  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center gap-2" aria-label="Periodo del mapa">
      {[7,28].map(n => <Boton key={n} type="button" aria-pressed={n === dias} variante={n === dias ? "primario" : "secundario"} onClick={() => periodo(n)}>{n} días</Boton>)}
      <span className="text-sm text-texto-suave">{desde} a {hasta} · Lima{mapa && ` · ${mapa.totalPedidos} pedidos`}</span>
    </div>
    <details className="ayuda-discreta"><summary>Ajustar</summary>
      <form className="grid gap-3 py-2" onSubmit={guardarAjustes}>
        <div className="flex flex-wrap gap-3">
          <label className="grid">Plato<select name="plato" defaultValue=""><option value="">Todos los platos</option>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label className="grid">Desde la hora<input name="inicio" type="number" required min={0} max={23} defaultValue={11} /></label>
          <label className="grid">Hasta la hora (sin incluir)<input name="fin" type="number" required min={1} max={24} defaultValue={22} /></label>
        </div>
        <fieldset><legend>Días de atención</legend><div className="flex flex-wrap gap-3">{DIAS_MAPA.map((d,i) => <label key={d}><input type="checkbox" name="dia" value={i} defaultChecked /> {d}</label>)}</div></fieldset>
        <label><input type="checkbox" name="confirmado" /> Confirmo el horario de atención para ver promociones sugeridas.</label>
        {errorFiltro && <p role="alert">{errorFiltro}</p>}
        <Boton type="submit" className="justify-self-start">Aplicar ajustes</Boton>
      </form>
    </details>
    {!mapa && (respuesta && !respuesta.ok ? <div role="alert">{respuesta.mensaje} <Boton onClick={() => reintentar(intento + 1)}>Reintentar</Boton></div> : <p role="status">Cargando el mapa…</p>)}
    {mapa && <>
      <div aria-live="polite">{resumen ? <>
        <p><strong>Hora pico</strong> · {descripcion(resumen.pico)}</p>
        <p><strong>Hora floja</strong> · {descripcion(resumen.floja)}</p>
      </> : <p>{mapa.totalPedidos ? "Todas las franjas abiertas tienen la misma demanda." : "No hay pedidos para este periodo."}</p>}</div>
      <Cuadricula key={JSON.stringify(filtro)} celdas={mapa.celdas} />
      <h3 className="font-bold">Promociones sugeridas</h3>
      {!confirmado ? <p>Confirma tu horario en Ajustar para ver las sugerencias.</p> :
        mapa.sugerencias.length ? <ul className="list-disc pl-5">{mapa.sugerencias.map(s => <li key={s.texto}>{s.texto}</li>)}</ul> :
        <p>{dias === 7 ? "Se necesitan al menos dos fechas por día de la semana. Prueba con 28 días." : "No hay franjas que cumplan las condiciones de baja demanda."}</p>}
    </>}
  </div>;
}

export function MapaCalorPanel() {
  const [esDemo, cambiar] = useState(false);
  const [demo, cargar] = useState<Demo>();
  const [error, avisar] = useState("");
  const [ocupado, esperar] = useState(false);
  async function abrirCSV(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    esperar(true); avisar(""); cargar(undefined);
    try {
      const textos = await Promise.all(["pedidos", "lineas_pedido"].map(async nombre => {
        const f = datos.get(nombre);
        if (!(f instanceof File) || !f.size || f.size > 5_000_000) throw new Error("Elige dos archivos CSV de hasta 5 MB cada uno.");
        return f.text();
      }));
      cargar(leerPedidosSinteticos(textos[0], textos[1]));
    } catch (e) { cargar(undefined); avisar(e instanceof Error ? e.message : "No pudimos leer los archivos."); }
    finally { esperar(false); }
  }
  return <section aria-labelledby="mapa-calor-titulo" className="min-w-0">
    <Tarjeta className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mapa-calor-titulo" className="text-xl font-bold">Mapa de calor de pedidos</h2>
        <button type="button" className="min-h-11 text-sm text-marca underline" disabled={ocupado} onClick={() => cambiar(!esDemo)}>{esDemo ? "Volver a pedidos reales" : "Modo demo"}</button>
      </div>
      {esDemo && <form onSubmit={abrirCSV} className="grid min-w-0 gap-3">
        <p>Demo con archivos sintéticos. Los archivos se leen en este navegador.</p>
        {["pedidos","lineas_pedido"].map(n => <label className="grid min-w-0" key={n}>{n}.csv<input type="file" className="max-w-full" name={n} accept=".csv" required /></label>)}
        <Boton type="submit" disabled={ocupado} className="justify-self-start">Cargar demo</Boton>
        {error && <p role="alert">{error}</p>}
      </form>}
      {!esDemo ? <Vista key="real" /> : demo && <Vista key="demo" demo={demo} />}
    </Tarjeta>
  </section>;
}
