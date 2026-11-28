"use client";

// US-151: Toqui, el asistente animado de AlToque, listo para cualquier rol (admin, cliente,
// mesero, cocina, caja). Se arrastra, saluda y abre un chat. NO llama a Claude por sí solo:
// recibe `responder`, una acción de servidor de cada HU que usa preguntarAClaude.
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Boton } from "@/components/ui";
import { PersonajeToqui } from "./personaje";
import { MensajeFormateado } from "./formato";
import { historialParaIA, type Linea, type MensajeToqui, type RespuestaToqui } from "./historial";
import "./toqui.css";

export type ToquiProps = {
  /** Acción de servidor de la HU: recibe la conversación (el último mensaje es del usuario). */
  responder: (mensajes: MensajeToqui[]) => Promise<RespuestaToqui>;
  /** Primer mensaje del chat y texto del globo al tocarlo. */
  saludo?: string;
  /** Preguntas de un toque, propias de cada rol. */
  sugerencias?: string[];
  /** Línea bajo el nombre, en el chat. */
  descripcion?: string;
  /** Dónde se guarda la posición (una por rol, para que no se pisen). */
  clavePosicion?: string;
  nombre?: string;
};

const MARGEN = 8;
const UMBRAL_ARRASTRE = 5; // px: más que esto es arrastre, no toque
const MAX_CARACTERES_PREGUNTA = 500;
const MENSAJE_FALLA = "IA no disponible por ahora";

function Puntos() {
  return <span className="toqui-puntos" aria-hidden="true"><span /><span /><span /></span>;
}

export function Toqui({
  responder,
  saludo = "¡Hola! Soy Toqui. ¿En qué te ayudo?",
  sugerencias = [],
  descripcion = "Asistente de AlToque",
  clavePosicion = "altoque:toqui-posicion",
  nombre = "Toqui",
}: ToquiProps) {
  const envoltura = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; izq: number; arr: number; movido: boolean } | null>(null);
  // true si el puntero ya manejó el gesto: el «click» que sigue se ignora (algunos
  // celulares lo omiten tras un arrastre rápido, así que el toque no depende de él).
  const manejadoPorPuntero = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saludando, setSaludando] = useState<"izquierda" | "derecha" | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [posicionChat, setPosicionChat] = useState<CSSProperties | null>(null);
  const [pensando, setPensando] = useState(false);
  // El saludo se muestra en el chat, pero no se manda a la IA (la conversación empieza por el usuario).
  const [lineas, setLineas] = useState<Linea[]>([{ de: "asistente", texto: saludo }]);
  const [texto, setTexto] = useState("");
  const idTitulo = useId();
  const idCampo = useId();

  useEffect(() => () => clearTimeout(temporizador.current), []);

  // ---------- Arrastre ----------
  // Coloca a Toqui sin salirse de la pantalla (estilo directo, sin estado de React).
  const colocar = useCallback((x: number, y: number) => {
    const el = envoltura.current;
    if (!el) return;
    const lim = (v: number, max: number) => Math.min(Math.max(v, MARGEN), Math.max(MARGEN, max));
    Object.assign(el.style, {
      left: `${lim(x, window.innerWidth - el.offsetWidth - MARGEN)}px`,
      top: `${lim(y, window.innerHeight - el.offsetHeight - MARGEN)}px`,
      right: "auto",
      bottom: "auto",
    });
    el.dataset.movido = "true"; // ya no se asoma desde el borde (celular)
  }, []);

  // Al cargar vuelve a la última posición guardada; si no se puede leer, se queda en la esquina.
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(clavePosicion) ?? "null");
      if (guardado && Number.isFinite(guardado.x) && Number.isFinite(guardado.y)) colocar(guardado.x, guardado.y);
    } catch { /* sin almacenamiento: esquina por defecto */ }
    const reajustar = () => {
      const el = envoltura.current;
      if (el?.style.left) colocar(el.offsetLeft, el.offsetTop);
    };
    window.addEventListener("resize", reajustar);
    return () => window.removeEventListener("resize", reajustar);
  }, [colocar, clavePosicion]);

  // ---------- Chat ----------
  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    if (abierto && !el.open) el.showModal();
    if (!abierto && el.open) el.close();
  }, [abierto]);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [lineas.length, pensando, abierto]);

  function abrirChat() {
    const r = envoltura.current?.getBoundingClientRect();
    const ancho = 368;
    const alto = Math.min(560, window.innerHeight - 2 * MARGEN);
    if (!r || window.innerWidth < 640) {
      setPosicionChat(null); // celular: casi pantalla completa (CSS)
    } else {
      const izquierda = r.left - ancho - 12 >= MARGEN ? r.left - ancho - 12 : Math.min(r.right + 12, window.innerWidth - ancho - MARGEN);
      const arriba = Math.min(Math.max(r.bottom - alto, MARGEN), window.innerHeight - alto - MARGEN);
      setPosicionChat({ left: izquierda, top: arriba, width: ancho, height: alto });
    }
    setSaludando(null);
    setAbierto(true);
  }

  // Al tocarlo saluda y luego abre el chat. Con «reducir movimiento» abre directo.
  function tocar() {
    if (saludando) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { abrirChat(); return; }
    const r = envoltura.current?.getBoundingClientRect();
    setSaludando(r && r.left + r.width / 2 < window.innerWidth / 2 ? "izquierda" : "derecha");
    temporizador.current = setTimeout(abrirChat, 1200);
  }

  function cerrar() {
    setAbierto(false);
    boton.current?.focus({ preventScroll: true });
  }

  async function preguntar(pregunta: string) {
    const limpia = pregunta.trim().slice(0, MAX_CARACTERES_PREGUNTA);
    if (!limpia || pensando) return;
    const nuevas: Linea[] = [...lineas, { de: "usuario", texto: limpia }];
    setLineas(nuevas);
    setPensando(true);
    let linea: Linea;
    try {
      const r = await responder(historialParaIA(nuevas));
      linea = r.ok ? { de: "asistente", texto: r.texto } : { de: "aviso", texto: r.motivo };
    } catch {
      linea = { de: "aviso", texto: MENSAJE_FALLA }; // sin internet o el servidor no respondió
    }
    setLineas((actuales) => [...actuales, linea]);
    setPensando(false);
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pregunta = texto;
    setTexto("");
    void preguntar(pregunta);
  }

  return (
    <>
      <div ref={envoltura} className="toqui-flotante" data-pensando={pensando} data-saludando={!!saludando}
        onKeyDown={(e) => {
          // Escape cancela el saludo antes de que se abra el chat.
          if (e.key === "Escape" && saludando) { clearTimeout(temporizador.current); setSaludando(null); }
        }}>
        {saludando && <p role="status" className="toqui-globo" data-lado={saludando}>{saludo}</p>}
        <button
          ref={boton}
          type="button"
          className="toqui-boton"
          aria-label={`Abrir el chat con ${nombre}, tu asistente. También puedes arrastrarlo.`}
          aria-haspopup="dialog"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const r = envoltura.current!.getBoundingClientRect();
            gesto.current = { x: e.clientX, y: e.clientY, izq: r.left, arr: r.top, movido: false };
            manejadoPorPuntero.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const g = gesto.current;
            if (!g) return;
            const dx = e.clientX - g.x;
            const dy = e.clientY - g.y;
            if (!g.movido && Math.hypot(dx, dy) <= UMBRAL_ARRASTRE) return;
            g.movido = true;
            envoltura.current!.dataset.arrastrando = "true";
            colocar(g.izq + dx, g.arr + dy);
          }}
          onPointerUp={() => {
            const g = gesto.current;
            if (!g) return;
            manejadoPorPuntero.current = true;
            if (!g.movido) { tocar(); return; } // 5 px o menos: es un toque
            const el = envoltura.current!;
            try { localStorage.setItem(clavePosicion, JSON.stringify({ x: el.offsetLeft, y: el.offsetTop })); } catch { /* no se guarda */ }
          }}
          onLostPointerCapture={() => {
            gesto.current = null;
            delete envoltura.current?.dataset.arrastrando;
          }}
          onKeyDown={() => { manejadoPorPuntero.current = false; }}
          onClick={() => {
            // Teclado (Enter o Espacio) y lectores de pantalla llegan solo por aquí.
            if (manejadoPorPuntero.current) { manejadoPorPuntero.current = false; return; }
            tocar();
          }}
        >
          <PersonajeToqui />
        </button>
      </div>

      {/* Escape cierra el diálogo (nativo) y el foco vuelve a Toqui. */}
      <dialog
        ref={dialogo}
        className="toqui-chat"
        aria-labelledby={idTitulo}
        data-celular={posicionChat === null}
        style={posicionChat ?? undefined}
        onClose={cerrar}
        onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
      >
        <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
          <span className="toqui-avatar"><PersonajeToqui /></span>
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="font-bold leading-tight">{nombre}</h2>
            <p className="text-xs text-texto-suave">{descripcion}</p>
          </div>
          <Boton variante="transparente" tamano="icono" onClick={cerrar} aria-label={`Cerrar el chat con ${nombre}`} className="text-xl text-texto">
            <span aria-hidden="true">✕</span>
          </Boton>
        </header>
        <div className="toqui-mensajes" aria-live="polite">
          {lineas.map((l, i) => (
            <div key={i} className="toqui-fila" data-de={l.de}>
              {l.de !== "usuario" && <span className="toqui-avatar toqui-avatar-chico"><PersonajeToqui /></span>}
              {l.de === "asistente" ? (
                // Respuesta de Toqui: negritas y viñetas (elementos de React, sin HTML crudo).
                <div className="toqui-burbuja toqui-formateado">
                  <span className="sr-only">{`${nombre}: `}</span><MensajeFormateado texto={l.texto} />
                </div>
              ) : (
                <p className="toqui-burbuja">
                  <span className="sr-only">{l.de === "usuario" ? "Tú: " : `${nombre}: `}</span>{l.texto}
                </p>
              )}
            </div>
          ))}
          {pensando && (
            <div className="toqui-fila" data-de="asistente">
              <span className="toqui-avatar toqui-avatar-chico"><PersonajeToqui /></span>
              <p className="toqui-burbuja"><Puntos /><span className="sr-only">{nombre} está escribiendo…</span></p>
            </div>
          )}
          <div ref={fin} />
        </div>
        <footer className="grid gap-2 border-t border-borde p-3">
          {sugerencias.length > 0 && (
            <div role="group" aria-label="Preguntas sugeridas" className="flex flex-wrap gap-1.5">
              {sugerencias.map((s) => (
                <button key={s} type="button" className="toqui-chip" disabled={pensando} onClick={() => void preguntar(s)}>{s}</button>
              ))}
            </div>
          )}
          <form onSubmit={enviar} className="flex items-end gap-2">
            <label htmlFor={idCampo} className="sr-only">Escribe tu pregunta para {nombre}</label>
            <input id={idCampo} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta…"
              autoComplete="off" maxLength={MAX_CARACTERES_PREGUNTA} className="min-w-0 flex-1" />
            <Boton type="submit" disabled={!texto.trim() || pensando}>Enviar</Boton>
          </form>
        </footer>
      </dialog>
    </>
  );
}
