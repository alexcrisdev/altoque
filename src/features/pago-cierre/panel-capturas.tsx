"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton, Insignia, Tarjeta } from "../../components/ui";
import { consultarCapturasAction, fotoCapturaAction, verificarCapturaAction } from "./capturas-actions";
import { suscribirCapturas } from "./capturas-realtime";
import { ESPERA_CONFIRMACION, motivoRechazoCaptura, programarConfirmacion, requiereAvisoCaptura, tiempoCaptura, type CapturaPendiente, type ResultadoCaptura } from "./capturas-logica";
import { centimosATexto, parsearSoles } from "./pago-logica";

function TarjetaCaptura({ captura, restauranteId, ahora, actualizar }: {
  captura: CapturaPendiente; restauranteId: string; ahora: number; actualizar: () => void;
}) {
  const [foto, setFoto] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [monto, setMonto] = useState("");
  const [otroMonto, setOtroMonto] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, setPendiente] = useState<{ vence: number; resultado: ResultadoCaptura } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cancelar = useRef<(() => void) | null>(null);
  const bloqueado = useRef(false);
  useEffect(() => {
    let activo = true;
    const renovar = async () => {
      try {
        const url = await fotoCapturaAction(restauranteId, captura.id);
        if (activo) { setFoto(url); setErrorFoto(url ? "" : "La captura ya no está disponible."); }
      } catch { if (activo) setErrorFoto("No se pudo cargar la foto. Reintentaremos automáticamente."); }
    };
    void renovar();
    const id = setInterval(() => void renovar(), 45_000);
    return () => { activo = false; clearInterval(id); };
  }, [restauranteId, captura.id]);
  useEffect(() => () => { cancelar.current?.(); }, []);
  function preparar(resultado: ResultadoCaptura) {
    if (bloqueado.current) return;
    if (resultado === "OTHER" && parsearSoles(monto) === null) { setMensaje("Escribe un monto recibido válido."); return; }
    if (resultado === "NOT_RECEIVED" && !motivoRechazoCaptura(motivo)) { setMensaje("Escribe un motivo de rechazo de 5 a 120 caracteres."); return; }
    bloqueado.current = true; setMensaje("");
    setPendiente({ resultado, vence: Date.now() + ESPERA_CONFIRMACION });
    cancelar.current = programarConfirmacion(() => {
      cancelar.current = null; setEnviando(true); setPendiente(null);
      void verificarCapturaAction(restauranteId, captura.id, resultado, monto, resultado === "NOT_RECEIVED" ? motivo : null)
        .then(r => { setMensaje(r.mensaje); if (r.ok) actualizar(); })
        .catch(() => setMensaje("No pudimos conectar. Actualiza antes de reintentar."))
        .finally(() => { bloqueado.current = false; setEnviando(false); });
    });
  }
  return <Tarjeta className="space-y-3">
    <h3 className="text-lg font-bold">{captura.titulo} · {captura.wallet === "YAPE" ? "Yape" : "Plin"}</h3>
    <p>Esperado: S/ {centimosATexto(captura.esperado)} · Declarado: S/ {centimosATexto(captura.declarado)}</p>
    <p><time dateTime={captura.creadaEn}>{new Date(captura.creadaEn).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}</time> · hace {tiempoCaptura(captura.creadaEn, ahora)}</p>
    {captura.duplicada && <Insignia tono="peligro">⚠ Esta imagen ya se subió antes</Insignia>}
    {foto && <a href={foto} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar captura de ${captura.titulo}`}>
      {/* URL privada de 60 s: evitar el caché del optimizador de imágenes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={foto} alt={`Captura de pago de ${captura.titulo}`} className="max-h-80 w-full object-contain" referrerPolicy="no-referrer" />
    </a>}
    {errorFoto && <p role="status">{errorFoto}</p>}
    <p className="text-sm font-semibold">Confirma con la notificación de tu Yape/Plin, no solo con esta foto.</p>
    {pendiente ? <div role="status" className="space-y-2">
      <p>{pendiente.resultado === "NOT_RECEIVED" ? "Registrando rechazo" : "Confirmando"} en {Math.max(0, Math.ceil((pendiente.vence - ahora) / 1000))} s</p>
      <Boton type="button" variante="secundario" onClick={() => { cancelar.current?.(); cancelar.current = null; bloqueado.current = false; setPendiente(null); }}>Deshacer</Boton>
    </div> : <fieldset disabled={enviando} className="flex flex-wrap gap-2">
      <legend className="sr-only">Verificar pago</legend>
      <Boton type="button" variante="exito" onClick={() => preparar("COMPLETE")}>Llegó completo</Boton>
      <Boton type="button" variante="secundario" onClick={() => setOtroMonto(!otroMonto)}>Llegó otro monto</Boton>
      <Boton type="button" variante="peligro" aria-expanded={rechazando} onClick={() => setRechazando(!rechazando)}>No llegó</Boton>
      {rechazando && <div className="w-full space-y-2">
        <label className="block">Motivo del rechazo (obligatorio)
          <input className="mt-1 block min-h-11 w-full rounded border px-2" maxLength={120} value={motivo} onChange={e => setMotivo(e.target.value)} />
        </label>
        <p className="text-sm">Indica por qué no se pudo verificar el ingreso, sin datos personales.</p>
        <Boton type="button" variante="peligro" onClick={() => preparar("NOT_RECEIVED")}>Registrar rechazo</Boton>
      </div>}
      {otroMonto && <div className="w-full space-y-2">
        <label className="block">Monto recibido (S/)<input className="ml-2 min-h-11 rounded border px-2" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} /></label>
        <Boton type="button" onClick={() => preparar("OTHER")}>Confirmar monto recibido</Boton>
      </div>}
    </fieldset>}
    {mensaje && <p role="status">{mensaje}</p>}
  </Tarjeta>;
}

export function PanelCapturas({ restauranteId, mesero = false }: { restauranteId: string; mesero?: boolean }) {
  const [capturas, setCapturas] = useState<CapturaPendiente[]>([]);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(0);
  const cargando = useRef(false);
  const actualizar = useCallback(async () => {
    if (cargando.current) return;
    cargando.current = true;
    try { setCapturas(await consultarCapturasAction(restauranteId, mesero)); setError(""); }
    catch { setError("No pudimos actualizar los pagos. Conservamos la última lista y reintentaremos."); }
    finally { cargando.current = false; }
  }, [restauranteId, mesero]);
  useEffect(() => {
    const inicio = setTimeout(() => { setAhora(Date.now()); void actualizar(); }, 0);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const respaldo = setInterval(() => { if (document.visibilityState === "visible") void actualizar(); }, 10_000);
    const cancelar = suscribirCapturas(restauranteId, () => void actualizar());
    const reanudar = () => { if (document.visibilityState === "visible") void actualizar(); };
    document.addEventListener("visibilitychange", reanudar); window.addEventListener("online", reanudar);
    return () => { clearTimeout(inicio); clearInterval(reloj); clearInterval(respaldo); cancelar(); document.removeEventListener("visibilitychange", reanudar); window.removeEventListener("online", reanudar); };
  }, [actualizar, restauranteId]);
  const visibles = mesero ? capturas.filter(c => requiereAvisoCaptura(c.creadaEn, ahora)) : capturas;
  return <section className="mt-6 space-y-3" aria-label={mesero ? "Alertas de Yape/Plin" : "Capturas por verificar"}>
    {!mesero && <h2 className="text-xl font-semibold">Por verificar · Yape/Plin</h2>}
    {error && <p role="status">{error}</p>}
    {!mesero && !error && capturas.length === 0 && <p>No hay capturas pendientes.</p>}
    {mesero ? <div role="status" aria-live="polite">{visibles.map(c => <Tarjeta key={c.id} tono="aviso">
      {c.titulo}: Yape/Plin por verificar hace {Math.floor((ahora - Date.parse(c.creadaEn)) / 60000)} min
    </Tarjeta>)}</div> : visibles.map(c => <TarjetaCaptura key={c.id} captura={c} restauranteId={restauranteId} ahora={ahora} actualizar={() => void actualizar()} />)}
  </section>;
}
