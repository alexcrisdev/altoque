import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ejecutamos los efectos reales con referencias persistentes entre refrescos,
// sin instalar un DOM ni conectarnos a Supabase.
const ciclo = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], indice: 0,
  efectos: [] as (() => void | (() => void))[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (valor: unknown) => {
    const indice = ciclo.indice++;
    return ciclo.refs[indice] ??= { current: valor };
  },
  useEffect: (efecto: () => void | (() => void)) => { ciclo.efectos.push(efecto); },
}));
import { AvisoEstadoCliente } from "../../src/features/pedidos/aviso-estado-cliente";
import type { EstadoPedido } from "../../src/features/pedidos/estados";

function mostrar(estado: EstadoPedido | null, modalidad: "DINE_IN" | "TAKEAWAY" = "DINE_IN") {
  ciclo.indice = 0;
  ciclo.efectos = [];
  const html = renderToStaticMarkup(createElement(AvisoEstadoCliente, { estado, modalidad }));
  ciclo.efectos.forEach((efecto) => efecto());
  return html;
}

beforeEach(() => { ciclo.refs = []; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function simularAudio(estado = "running") {
  const start = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("AudioContext", class {
    state = estado;
    currentTime = 0;
    destination = {};
    close = close;
    createOscillator() {
      return { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn() };
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    }
  });
  return { start, close };
}

describe("aviso accesible US-070", () => {
  it.each([
    ["DINE_IN", "Tu pedido está listo, el mesero te lo lleva"],
    ["TAKEAWAY", "Recógelo en el mostrador"],
  ] as const)("destaca y anuncia el pedido %s", (modalidad, mensaje) => {
    const html = mostrar("READY", modalidad);
    expect(html).toContain(mensaje);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("text-2xl");
  });

  it.each(["PENDING", "ACCEPTED", "IN_PROGRESS", "DELIVERED", "CANCELLED"] as const)(
    "no destaca ni notifica el estado %s", (estado) => {
      const { start } = simularAudio();
      const vibrate = vi.fn();
      vi.stubGlobal("navigator", { vibrate });
      expect(mostrar(estado)).not.toContain("text-2xl");
      expect(start).not.toHaveBeenCalled();
      expect(vibrate).not.toHaveBeenCalled();
    },
  );

  it("no repite sonido ni vibración tras refrescos o una consulta fallida", () => {
    const { start, close } = simularAudio();
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    mostrar("IN_PROGRESS");
    mostrar("READY");
    mostrar("READY");
    expect(mostrar(null)).toBe("");
    mostrar("READY");
    expect(start).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith([200, 100, 200]);
    expect(close).not.toHaveBeenCalled();
  });

  it("mantiene el aviso visual sin APIs multimedia", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("navigator", {});
    expect(mostrar("READY")).toContain("Tu pedido está listo");
  });

  it("tolera que ambas APIs lancen errores", () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("No permitido"); } });
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("No permitido"); } });
    expect(mostrar("READY", "TAKEAWAY")).toContain("Recógelo en el mostrador");
  });

  it("no programa audio pendiente si el navegador lo mantiene suspendido", () => {
    const { start } = simularAudio("suspended");
    expect(mostrar("READY")).toContain("Tu pedido está listo");
    expect(start).not.toHaveBeenCalled();
  });

  it("ofrece un botón para habilitar el sonido antes de estar listo", () => {
    const html = mostrar("IN_PROGRESS");
    expect(html).toContain('type="button"');
    expect(html).toContain("Activar sonido del aviso");
  });
});
