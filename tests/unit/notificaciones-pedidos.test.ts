import { describe, expect, it, vi } from "vitest";
import { crearSeguimientoPedidosListos, emitirAviso, textoPedidoListo, type PedidoParaAviso } from "../../src/features/pedidos/notificaciones";

function pedido(cambios: Partial<PedidoParaAviso> = {}): PedidoParaAviso {
  return {
    id: "pedido-1",
    numero: 42,
    estado: "IN_PROGRESS",
    listoEn: null,
    modalidad: "DINE_IN",
    mesaId: "mesa-1",
    mesaNumero: 3,
    nombreCliente: null,
    ...cambios,
  };
}

describe("notificación de pedidos listos", () => {
  it("no avisa de pedidos que ya estaban READY al abrir el panel", () => {
    const listo = pedido({ estado: "READY", listoEn: "2026-11-10T15:00:00Z" });
    const seguimiento = crearSeguimientoPedidosListos([listo]);

    expect(seguimiento.observar(listo)).toBeNull();
  });

  it("avisa una sola vez aunque Realtime y el refresco detecten la misma transición", () => {
    const seguimiento = crearSeguimientoPedidosListos([pedido()]);
    const listo = pedido({ estado: "READY", listoEn: "2026-11-10T15:01:00Z" });

    expect(seguimiento.observar(listo)).toEqual({ pedido: listo, clave: "pedido-1:2026-11-10T15:01:00Z" });
    expect(seguimiento.observar(listo)).toBeNull();
  });

  it("permite un nuevo aviso si el pedido vuelve a preparación y queda listo otra vez", () => {
    const primeraFecha = "2026-11-10T15:01:00Z";
    const seguimiento = crearSeguimientoPedidosListos([pedido()]);
    expect(seguimiento.observar(pedido({ estado: "READY", listoEn: primeraFecha }))).not.toBeNull();
    expect(seguimiento.observar(pedido({ estado: "IN_PROGRESS", listoEn: null }))).toBeNull();

    const segundoListo = pedido({ estado: "READY", listoEn: "2026-11-10T15:03:00Z" });
    expect(seguimiento.observar(segundoListo)).toEqual({ pedido: segundoListo, clave: "pedido-1:2026-11-10T15:03:00Z" });
  });

  it("deduplica y permite transiciones repetidas si ready_at llega vacío", () => {
    const seguimiento = crearSeguimientoPedidosListos([pedido()]);
    const listo = pedido({ estado: "READY" });
    expect(seguimiento.observar(listo)?.clave).toBe("pedido-1:sin-fecha:1");
    expect(seguimiento.observar(listo)).toBeNull();
    seguimiento.observar(pedido({ estado: "IN_PROGRESS" }));
    expect(seguimiento.observar(listo)?.clave).toBe("pedido-1:sin-fecha:2");
  });

  it("construye el texto con mesa o modalidad para llevar", () => {
    expect(textoPedidoListo(pedido())).toBe("Mesa 3: pedido #42 listo");
    expect(textoPedidoListo(pedido({ modalidad: "TAKEAWAY", mesaId: null, mesaNumero: null })))
      .toBe("Para llevar: pedido #42 listo");
  });

  it("muestra el aviso aunque el dispositivo no admita sonido", () => {
    const mostrar = vi.fn();
    const vibrar = vi.fn();
    emitirAviso({ audio: null, mostrar, vibrar });
    expect(mostrar).toHaveBeenCalledOnce();
    expect(vibrar).toHaveBeenCalledExactlyOnceWith([180, 100, 180]);
  });

  it("reproduce el tono cuando el usuario ya activó el audio del navegador", () => {
    const oscilador = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), frequency: { value: 0 }, type: "sine", onended: null };
    const volumen = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
    const audio = {
      state: "running", currentTime: 0, destination: {},
      createOscillator: vi.fn(() => oscilador), createGain: vi.fn(() => volumen),
    } as unknown as AudioContext;

    emitirAviso({ audio, mostrar: vi.fn(), vibrar: vi.fn() });
    expect(audio.createOscillator).toHaveBeenCalledOnce();
    expect(oscilador.start).toHaveBeenCalledOnce();
    expect(oscilador.stop).toHaveBeenCalledOnce();
  });
});
