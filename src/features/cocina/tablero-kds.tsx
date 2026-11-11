"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerKds, cambiarEstadoKds } from "./kds-actions";
import { minutosDesde } from "./cocina-logica";
import { asignarAtajos, colorEspera, crearSeguimientoNuevos, deshacerVigente, diaLima, ETIQUETA_ESPERA, numeroAtajo, pedidosDelDia, PLAZO_DESHACER_KDS, resumenPreparacion } from "./kds-logica";
import { reproducirTonoAviso } from "../pedidos/notificaciones";
import { ReportarIncidencia, MarcarIncidenciaResuelta } from "./reportar-incidencia";
import { describirDestino } from "../pedidos/modalidad";
import { ETIQUETA_TIPO_INCIDENCIA } from "../pedidos/incidencias";
import type { PedidoCocina } from "./tipos";

type Panel = Awaited<ReturnType<typeof obtenerKds>>;
type Vista = { datos: Panel; cancelados: Record<string, number>; atajos: Record<string, number> };
function combinar(anterior: Vista, datos: Panel): Vista {
  if (!datos.ok) return anterior;
  if (anterior.datos.ok && datos.actualizadoEn < anterior.datos.actualizadoEn) return anterior;
  const cancelados = Object.fromEntries(Object.entries(anterior.cancelados).filter(([, fin]) => fin > datos.actualizadoEn));
  if (anterior.datos.ok) {
    const previos = anterior.datos.pedidos;
    for (const p of datos.pedidos) {
      if (p.estado === "CANCELLED" && previos.some((previo) => previo.id === p.id && previo.estado !== "CANCELLED")) {
        cancelados[p.id] = datos.actualizadoEn + 5000;
      }
    }
  }
  const mismoDia = anterior.datos.ok && diaLima(anterior.datos.actualizadoEn).inicio === diaLima(datos.actualizadoEn).inicio;
  return { datos, cancelados, atajos: asignarAtajos(pedidosDelDia(datos.pedidos, datos.actualizadoEn), mismoDia ? anterior.atajos : {}) };
}
const colores = {
  verde: "border-exito-borde bg-exito-fondo text-exito-texto",
  amarillo: "border-aviso-borde bg-aviso-fondo text-aviso-texto",
  rojo: "border-peligro-borde bg-peligro-fondo text-peligro-texto",
};
const horaLima = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

export function TableroKds({ inicial, tv }: { inicial: Panel; tv: boolean }) {
  const [vista, setVista] = useState<Vista>(() => ({ datos: inicial, cancelados: {}, atajos: asignarAtajos(inicial.ok ? pedidosDelDia(inicial.pedidos, inicial.actualizadoEn) : []) }));
  const [anterior, setAnterior] = useState(inicial);
  const [ahora, setAhora] = useState(inicial.ok ? inicial.actualizadoEn : 0);
  const [error, setError] = useState(inicial.ok ? "" : "No pudimos cargar los pedidos. Reintentando…");
  const [guardando, setGuardando] = useState(false);
  const [ultimoListo, setUltimoListo] = useState<{ id: string; confirmadoEn: string } | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [sonido, setSonido] = useState(false);
  const [observarNuevos] = useState(() => crearSeguimientoNuevos());
  const audio = useRef<AudioContext | null>(null);
  const ocupado = useRef(false);
  const montado = useRef(true);
  const refrescando = useRef(false);
  const version = useRef(0);
  if (inicial !== anterior) {
    setAnterior(inicial);
    setVista(combinar(vista, inicial));
  }

  async function habilitarSonido() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (montado.current) setSonido(audio.current.state === "running");
    } catch { /* El tablero visual sigue funcionando. */ }
  }

  useEffect(() => {
    montado.current = true;
    const reloj = window.setInterval(() => setAhora(Date.now()), 250);
    const habilitar = () => { void habilitarSonido(); };
    window.addEventListener("pointerdown", habilitar);
    return () => {
      montado.current = false;
      window.clearInterval(reloj);
      window.removeEventListener("pointerdown", habilitar);
      const contexto = audio.current;
      audio.current = null;
      if (contexto && contexto.state !== "closed") void contexto.close().catch(() => {});
    };
  }, []);

  const panel = vista.datos;
  useEffect(() => {
    if (!panel.ok) return;
    const nuevos = observarNuevos(panel.pedidos);
    if (!nuevos) return;
    try {
      audio.current ??= new AudioContext();
      reproducirTonoAviso(audio.current);
    } catch { /* Audio opcional: nunca bloquea los pedidos nuevos. */ }
  }, [panel, observarNuevos]);

  useEffect(() => {
    let activo = true;
    async function refrescar() {
      if (!activo || document.visibilityState !== "visible" || refrescando.current || ocupado.current) return;
      if (!navigator.onLine) { setError("Sin conexión. Conservamos los últimos pedidos."); return; }
      refrescando.current = true;
      const consultaVersion = version.current;
      try {
        const resultado = await obtenerKds();
        if (!activo || consultaVersion !== version.current) return;
        if (resultado.ok) { setVista((previa) => combinar(previa, resultado)); setError(""); }
        else setError("No pudimos actualizar. Conservamos los últimos pedidos.");
      } catch {
        if (activo && consultaVersion === version.current) setError("No pudimos actualizar. Reintentando…");
      } finally { refrescando.current = false; }
    }
    const intervalo = window.setInterval(() => void refrescar(), 3000);
    window.addEventListener("online", refrescar);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      activo = false; window.clearInterval(intervalo);
      window.removeEventListener("online", refrescar);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, []);

  const pedidos = pedidosDelDia(panel.ok ? panel.pedidos : [], ahora);
  const preparacion = pedidos.filter((p) => p.estado === "IN_PROGRESS");
  const listos = pedidos.filter((p) => p.estado === "READY");
  const deshacer = ultimoListo && deshacerVigente(ultimoListo.confirmadoEn, ahora) ? listos.find((p) => p.id === ultimoListo.id) : undefined;
  const resumen = resumenPreparacion(pedidos);

  const guardar = useCallback(async (pedido: PedidoCocina, revertir = false) => {
    if (tv || ocupado.current) return;
    if (revertir && (!ultimoListo || ultimoListo.id !== pedido.id || !deshacerVigente(ultimoListo.confirmadoEn, ahora))) return;
    version.current += 1;
    ocupado.current = true; setGuardando(true); setError(""); setMensaje("");
    try {
      const resultado = await cambiarEstadoKds(pedido.id, revertir);
      if (!montado.current) return;
      if (!resultado.ok) setError(resultado.mensaje);
      else {
        setMensaje(revertir ? `Pedido N.º ${pedido.numero}: volvió a preparación.` : `Pedido N.º ${pedido.numero}: marcado como Listo.`);
        if (revertir) setUltimoListo(null);
      }
      const actualizado = await obtenerKds();
      if (montado.current && actualizado.ok) {
        const recibidoEn = Date.now();
        setAhora(recibidoEn);
        setVista((previa) => combinar(previa, actualizado));
        if (resultado.ok && !revertir) setUltimoListo({ id: pedido.id, confirmadoEn: new Date(recibidoEn).toISOString() });
      }
      else if (montado.current) setError("No pudimos actualizar. Volveremos a consultar el estado.");
    } catch {
      if (montado.current) setError("No pudimos confirmar el cambio. Revisa el estado antes de reintentar.");
    } finally {
      ocupado.current = false;
      if (montado.current) setGuardando(false);
    }
  }, [tv, ultimoListo, ahora]);

  useEffect(() => {
    if (tv) return;
    function tecla(evento: KeyboardEvent) {
      const elemento = evento.target;
      const editando = elemento instanceof HTMLElement && !!elemento.closest("input, textarea, select, button, a, summary, [contenteditable], [role=dialog], [role=alertdialog], [role=slider], [role=spinbutton], [role=combobox]");
      const numero = numeroAtajo(evento, editando);
      if (numero === null) return;
      const pedido = numero === 0 ? deshacer : preparacion.find((p) => vista.atajos[p.id] === numero);
      if (!pedido) return;
      evento.preventDefault(); void guardar(pedido, numero === 0);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function detalle(pedido: PedidoCocina, numero?: number) {
    return <>
      <span className="flex flex-wrap items-center justify-between gap-2 font-bold">
        <span>Pedido N.º {pedido.numero}</span>
        {numero !== undefined && <span className="rounded-lg border px-3 py-1">Tecla {numero}</span>}
      </span>
      <span className="mt-2 block font-semibold">{describirDestino({ modalidad: pedido.modalidad, mesaNumero: pedido.mesaNumero, nombre: pedido.nombreCliente, telefono: null })}</span>
      <span className="mt-1 block">Llegó a las <time dateTime={pedido.creadoEn}>{horaLima.format(new Date(pedido.creadoEn))}</time> · Espera: {minutosDesde(pedido.creadoEn, ahora)} min</span>
      <span className="mt-1 block font-semibold">{ETIQUETA_ESPERA[colorEspera(pedido.creadoEn, ahora)]}</span>
      {pedido.items.map((item, i) => <span key={i} className="mt-4 block">
        <span className="block font-bold">{item.cantidad} × {item.nombre}</span>
        {item.observacion && <span className="mt-1 block rounded-lg bg-aviso-fondo p-2 font-bold text-aviso-texto">Observación: {item.observacion}</span>}
        {!!item.alergenos?.length && <span className="mt-1 block rounded-lg border-2 border-peligro-borde bg-peligro-fondo p-2 font-bold text-peligro-texto">Alérgenos: {item.alergenos.join(", ")}</span>}
      </span>)}
      {!!pedido.incidenciasAbiertas.length && <span className="mt-3 block font-bold">⚠ Incidencias abiertas: {pedido.incidenciasAbiertas.length}</span>}
    </>;
  }

  function tarjeta(pedido: PedidoCocina, lista: boolean) {
    const clase = `block min-w-0 w-full break-words rounded-xl border-2 p-4 sm:p-5 text-left ${colores[colorEspera(pedido.creadoEn, ahora)]}`;
    return <li key={pedido.id}>
      {!tv && !lista ? <button type="button" className={`${clase} focus-visible:outline-4 focus-visible:outline-marca disabled:opacity-60`}
        disabled={guardando} onClick={(evento) => {
          // La primera tarjeta puede salir antes del segundo clic del mismo gesto.
          if (evento.detail > 1) return;
          void guardar(pedido);
        }} aria-label={`Marcar listo el pedido N.º ${pedido.numero}`}>
        {detalle(pedido, vista.atajos[pedido.id])}<span className="mt-4 block font-bold">{guardando ? "Guardando…" : "Marcar Listo"}</span>
      </button> : <article className={clase}>{detalle(pedido)}{lista && <p className="mt-4 font-bold">Esperando al mesero</p>}</article>}
      {pedido.incidenciasAbiertas.map((incidencia) => <div key={incidencia.id} className="mt-2 rounded-lg bg-aviso-fondo p-3 text-aviso-texto">
        <p className="font-bold">{ETIQUETA_TIPO_INCIDENCIA[incidencia.tipo]}</p><p>{incidencia.descripcion}</p>
        {!tv && <MarcarIncidenciaResuelta pedidoId={pedido.id} incidenciaId={incidencia.id} descripcion={incidencia.descripcion} />}
      </div>)}
      {!tv && <ReportarIncidencia pedidoId={pedido.id} estado={pedido.estado} numero={pedido.numero} />}
    </li>;
  }

  return <div className={tv ? "space-y-6 text-2xl lg:text-3xl" : "space-y-5 text-lg"}>
    {error && <p role="alert" className="rounded-lg bg-peligro-fondo p-3 text-peligro-texto">{error}</p>}
    {!tv ? <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={habilitarSonido} className="rounded-lg border border-borde px-4 py-2">{sonido ? "Sonido activado" : "Activar sonido"}</button>
      <p>Teclas 1–9: Listo · 0: Deshacer</p>
      <button type="button" disabled={guardando} onClick={() => {
        setVista((previa) => ({ ...previa, atajos: asignarAtajos(preparacion) }));
        setMensaje("Teclas reasignadas. Revisa los números de las tarjetas antes de continuar.");
      }} className="rounded-lg border border-borde px-4 py-2">Reasignar teclas 1–9</button>
      <p className="text-sm text-texto-suave">Las teclas conservan su pedido. Reasigna para dar teclas a otras tarjetas; todas se pueden tocar.</p>
      {deshacer && <button type="button" disabled={guardando} onClick={() => void guardar(deshacer, true)} className="rounded-lg bg-marca px-4 py-3 font-bold text-white">
        Deshacer pedido {deshacer.numero} (0) · {Math.ceil((Date.parse(ultimoListo!.confirmadoEn) + PLAZO_DESHACER_KDS - ahora) / 1000)} s
      </button>}
    </div> : <p className="text-texto-suave">Modo TV · {sonido ? "Sonido activado" : "Toca la pantalla para habilitar el sonido"}</p>}
    <p role="status" aria-live="polite" aria-atomic="true">{mensaje}</p>
    <section aria-label="Resumen pendiente" className="rounded-xl border border-borde bg-superficie p-5">
      <h2 className="mb-3 text-2xl font-bold">Falta preparar</h2>
      {resumen.length ? <ul className="flex flex-wrap gap-x-8 gap-y-2">{resumen.map((item) => <li key={item.nombre}><strong>{item.cantidad}×</strong> {item.nombre}</li>)}</ul> : <p>Nada pendiente de preparar</p>}
    </section>
    <div role="status" aria-live="polite">{preparacion.length} en preparación · {listos.length} listos</div>
    {pedidos.filter((p) => p.estado === "CANCELLED" && (vista.cancelados[p.id] ?? 0) > ahora).map((p) => <p key={p.id} role="alert"
      className="motion-safe:animate-pulse rounded-xl border-2 border-peligro-borde bg-peligro-fondo p-5 font-bold text-peligro-texto">Pedido N.º {p.numero} cancelado — no preparar</p>)}
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      <section aria-label="En preparación"><h2 className="mb-4 text-2xl font-bold">En preparación</h2>
        <ul className="space-y-4">{preparacion.map((p) => tarjeta(p, false))}</ul>{!preparacion.length && <p>Sin pedidos en preparación</p>}
      </section>
      <section aria-label="Listos"><h2 className="mb-4 text-2xl font-bold">Listos</h2>
        <ul className="space-y-4">{listos.map((p) => tarjeta(p, true))}</ul>{!listos.length && <p>Sin pedidos listos</p>}
      </section>
    </div>
  </div>;
}
