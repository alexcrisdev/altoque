"use client";

import { useEffect, useRef, useState } from "react";
import { Boton, MensajeEstado, Tarjeta } from "../../components/ui";
import { detectarNuevos, textoAntiguedad } from "./alertas-logica";
import { minutosDesde } from "./panel-logica";
import { atenderSolicitudAction } from "./ayuda-actions";
import type { SolicitudAyuda } from "./ayuda";
import type { PedidoActivo } from "./pedidos-activos";

type Aviso = { id: string; texto: string };
const CLAVE_SONIDO = "altoque:mesero:sonido";

function emitirSonido(audio: AudioContext | null) {
  if (!audio || audio.state !== "running") return;
  try {
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = 880;
    volumen.gain.setValueAtTime(0.12, audio.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    oscilador.connect(volumen);
    volumen.connect(audio.destination);
    oscilador.start();
    oscilador.stop(audio.currentTime + 0.2);
    oscilador.onended = () => { oscilador.disconnect(); volumen.disconnect(); };
  } catch {
    // El aviso visible sigue funcionando si el navegador rechaza el audio.
  }
}

export function AlertasMesero({ pedidos, solicitudes, actualizadoEn, error = false, errorSolicitudes = false }: {
  pedidos: readonly PedidoActivo[] | null;
  solicitudes: readonly SolicitudAyuda[] | null;
  actualizadoEn: string | null;
  error?: boolean;
  errorSolicitudes?: boolean;
}) {
  const idsVistos = useRef<Set<string> | null>(null);
  const idsAyudaVistos = useRef<Set<string> | null>(null);
  const idsAtendidas = useRef(new Set<string>());
  const atendiendoRef = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [sonido, setSonido] = useState(false);
  const [preferenciaGuardada, setPreferenciaGuardada] = useState(false);
  const [errorSonido, setErrorSonido] = useState("");
  const [listaAyuda, setListaAyuda] = useState<readonly SolicitudAyuda[]>(solicitudes ?? []);
  const [ultimaHoraAyuda, setUltimaHoraAyuda] = useState(actualizadoEn);
  const [atendiendo, setAtendiendo] = useState<string | null>(null);
  const [mensajeAyuda, setMensajeAyuda] = useState("");

  useEffect(() => {
    const tituloOriginal = document.title;
    let preferido = false;
    try { preferido = localStorage.getItem(CLAVE_SONIDO) === "true"; } catch { /* El almacenamiento es opcional. */ }
    const temporizador = window.setTimeout(() => setPreferenciaGuardada(preferido), 0);
    return () => {
      window.clearTimeout(temporizador);
      document.title = tituloOriginal;
      void audio.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const titulo = avisos.length ? `(${avisos.length}) Panel mesero` : "Panel mesero";
    const actualizarTitulo = () => {
      if (document.title !== titulo) document.title = titulo;
    };
    // Next.js puede restaurar sus metadatos durante router.refresh().
    const observador = new MutationObserver(actualizarTitulo);
    observador.observe(document.head, { childList: true, subtree: true, characterData: true });
    actualizarTitulo();
    return () => observador.disconnect();
  }, [avisos.length]);

  useEffect(() => {
    if (pedidos === null) return; // Un fallo no se interpreta como una lista vacía.
    const nuevos = detectarNuevos(idsVistos.current, pedidos);
    const vistos = idsVistos.current ?? new Set<string>();
    pedidos.forEach((pedido) => vistos.add(pedido.id));
    idsVistos.current = vistos;
    if (!nuevos.length) return;
    const temporizador = window.setTimeout(() => {
      setAvisos((actuales) => [...actuales, ...nuevos.map((pedido) => ({
        id: pedido.id,
        texto: `Nuevo pedido N.º ${pedido.numero} · ${pedido.modalidad === "TAKEAWAY"
          ? `Para llevar${pedido.nombreCliente ? ` · ${pedido.nombreCliente}` : ""}`
          : `Mesa ${pedido.mesaNumero ?? "sin identificar"}`}`,
      }))]);
      if (sonido) emitirSonido(audio.current);
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [pedidos, sonido]);

  useEffect(() => {
    if (solicitudes === null) return; // Conservar la última lectura correcta si falla ayuda.
    const vigentes = solicitudes.filter((solicitud) => !idsAtendidas.current.has(solicitud.id));
    const nuevos = detectarNuevos(idsAyudaVistos.current,
      vigentes.map((solicitud) => ({ ...solicitud, estado: "PENDING" as const })));
    const vistos = idsAyudaVistos.current ?? new Set<string>();
    vigentes.forEach((solicitud) => vistos.add(solicitud.id));
    idsAyudaVistos.current = vistos;
    const actuales = new Set(vigentes.map((solicitud) => `ayuda:${solicitud.id}`));
    const temporizador = window.setTimeout(() => {
      setListaAyuda(vigentes);
      setUltimaHoraAyuda(actualizadoEn);
      setAvisos((anteriores) => [
        ...anteriores.filter((aviso) => !aviso.id.startsWith("ayuda:") || actuales.has(aviso.id)),
        ...nuevos.map((solicitud) => ({ id: `ayuda:${solicitud.id}`,
          texto: `Solicitud de ayuda · ${solicitud.mesaNumero === null ? "Mostrador" : `Mesa ${solicitud.mesaNumero}`}` })),
      ]);
      if (nuevos.length && sonido) emitirSonido(audio.current);
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [solicitudes, actualizadoEn, sonido]);

  async function atender(id: string) {
    if (atendiendoRef.current) return;
    atendiendoRef.current = true;
    setAtendiendo(id);
    setMensajeAyuda("");
    try {
      const resultado = await atenderSolicitudAction(id);
      setMensajeAyuda(resultado.mensaje);
      if (resultado.ok || resultado.codigo === "ALREADY_ATTENDED") {
        idsAtendidas.current.add(id);
        setListaAyuda((actuales) => actuales.filter((solicitud) => solicitud.id !== id));
        setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== `ayuda:${id}`));
      }
    } catch {
      setMensajeAyuda("No pudimos atender la solicitud. Conservamos la lista para que puedas reintentar.");
    } finally {
      atendiendoRef.current = false;
      setAtendiendo(null);
    }
  }

  async function cambiarSonido() {
    setErrorSonido("");
    const activar = !sonido;
    try {
      if (activar) {
        audio.current ??= new AudioContext();
        await audio.current.resume();
        emitirSonido(audio.current);
      } else {
        await audio.current?.suspend();
      }
      setSonido(activar);
      setPreferenciaGuardada(activar);
      try { localStorage.setItem(CLAVE_SONIDO, String(activar)); } catch { /* No bloquear alertas sin almacenamiento. */ }
    } catch {
      setErrorSonido("No pudimos activar el sonido. Los avisos seguirán apareciendo en pantalla.");
    }
  }

  return <section aria-label="Alertas del mesero" className="mt-6 space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <Boton type="button" variante="secundario" aria-pressed={sonido} onClick={cambiarSonido}>
        {sonido ? "Desactivar sonido" : "Activar sonido"}
      </Boton>
      {preferenciaGuardada && !sonido && <p className="text-sm text-texto-suave">Activa el sonido guardado en esta pestaña.</p>}
    </div>
    {errorSonido && <p role="status" className="text-sm text-texto-suave">{errorSonido}</p>}
    {error && <p role="status" className="text-sm text-aviso-texto">No pudimos actualizar las alertas. Conservamos los avisos y volveremos a intentarlo.</p>}
    <div role="status" aria-live="polite" aria-atomic="true" className="space-y-2">
      {avisos.map((aviso) => <Tarjeta key={aviso.id} className="flex flex-wrap items-center justify-between gap-3 border-info-borde bg-info-fondo">
        <p className="font-semibold">{aviso.texto}</p>
        <Boton type="button" variante="fantasma" aria-label={`Cerrar aviso: ${aviso.texto}`}
          onClick={() => setAvisos((actuales) => actuales.filter((actual) => actual.id !== aviso.id))}>Cerrar aviso</Boton>
      </Tarjeta>)}
    </div>
    <section aria-labelledby="mesero-ayuda" className="pt-3">
      <h2 id="mesero-ayuda" className="mb-3 text-xl font-semibold">Solicitudes de ayuda</h2>
      {errorSolicitudes && <p role="status" className="mb-3 text-sm text-aviso-texto">
        No pudimos actualizar las solicitudes. Conservamos la última lista y volveremos a intentarlo.
      </p>}
      {mensajeAyuda && <p role="status" className="mb-3 text-sm">{mensajeAyuda}</p>}
      {listaAyuda.length === 0 ? (!errorSolicitudes && <MensajeEstado tipo="vacio" titulo="No hay solicitudes de ayuda pendientes." />) :
        <ul className="grid gap-3 md:grid-cols-2">{listaAyuda.map((solicitud) => <li key={solicitud.id}>
          <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{solicitud.mesaNumero === null ? "Mostrador" : `Mesa ${solicitud.mesaNumero}`}</h3>
              <p className="mt-1 text-sm text-texto-suave">
                <time dateTime={solicitud.creadaEn}>{new Date(solicitud.creadaEn).toLocaleTimeString("es-PE", {
                  hour: "2-digit", minute: "2-digit", timeZone: "America/Lima",
                })}</time>
                {` · ${textoAntiguedad(minutosDesde(solicitud.creadaEn, actualizadoEn ?? ultimaHoraAyuda ?? solicitud.creadaEn))}`}
              </p>
            </div>
            <Boton type="button" variante="secundario" disabled={atendiendo !== null}
              aria-label={`Atender solicitud de ${solicitud.mesaNumero === null ? "mostrador" : `Mesa ${solicitud.mesaNumero}`}`}
              onClick={() => atender(solicitud.id)}>{atendiendo === solicitud.id ? "Atendiendo…" : "Atendida"}</Boton>
          </Tarjeta>
        </li>)}</ul>}
    </section>
  </section>;
}
