import type { Modalidad } from "./modalidad";
import type { EstadoPedido } from "./estados";

export type PedidoParaAviso = {
  id: string;
  numero: number;
  estado: EstadoPedido;
  listoEn: string | null;
  modalidad: Modalidad;
  mesaId: string | null;
  mesaNumero: number | null;
  nombreCliente: string | null;
};

export type AvisoPedidoListo = { pedido: PedidoParaAviso; clave: string };

type EstadoObservado = Pick<PedidoParaAviso, "estado" | "listoEn">;

export function crearSeguimientoPedidosListos(iniciales: readonly PedidoParaAviso[]) {
  const estados = new Map<string, EstadoObservado>();
  const avisados = new Set<string>();
  const generacionesSinFecha = new Map<string, number>();

  for (const pedido of iniciales) {
    estados.set(pedido.id, { estado: pedido.estado, listoEn: pedido.listoEn });
    if (pedido.estado === "READY") {
      avisados.add(pedido.listoEn === null ? `${pedido.id}:sin-fecha:0` : `${pedido.id}:${pedido.listoEn}`);
    }
  }

  return {
    observar(pedido: PedidoParaAviso): AvisoPedidoListo | null {
      const anterior = estados.get(pedido.id);
      const pasoAListo = pedido.estado === "READY" && (
        anterior === undefined
        || anterior.estado !== "READY"
        || (pedido.listoEn !== null && anterior.listoEn !== pedido.listoEn)
      );
      estados.set(pedido.id, { estado: pedido.estado, listoEn: pedido.listoEn });
      if (!pasoAListo) return null;

      let clave: string;
      if (pedido.listoEn !== null) {
        clave = `${pedido.id}:${pedido.listoEn}`;
      } else {
        const generacion = (generacionesSinFecha.get(pedido.id) ?? 0) + 1;
        generacionesSinFecha.set(pedido.id, generacion);
        clave = `${pedido.id}:sin-fecha:${generacion}`;
      }
      if (avisados.has(clave)) return null;
      avisados.add(clave);
      return { pedido, clave };
    },
  };
}

export function textoPedidoListo(pedido: PedidoParaAviso): string {
  const destino = pedido.modalidad === "TAKEAWAY"
    ? "Para llevar"
    : `Mesa ${pedido.mesaNumero ?? "sin identificar"}`;
  return `${destino}: pedido #${pedido.numero} listo`;
}

type EmitirAvisoProps = {
  audio: AudioContext | null;
  mostrar: () => void;
  patronVibracion?: number | number[];
  vibrar?: (patron: number | number[]) => void;
};

/** Muestra un aviso y, si el navegador lo permite, reproduce un tono y vibra. */
export function emitirAviso({ audio, mostrar, patronVibracion = [180, 100, 180], vibrar }: EmitirAvisoProps): void {
  mostrar();
  reproducirTonoAviso(audio);
  try {
    const vibrador = vibrar ?? (typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
      ? navigator.vibrate.bind(navigator)
      : undefined);
    vibrador?.(patronVibracion);
  } catch {
    // Algunos navegadores desactivan vibración; el aviso visual permanece.
  }
}

export function reproducirTonoAviso(audio: AudioContext | null): void {
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
    // El aviso visual sigue funcionando si el navegador rechaza el audio.
  }
}
