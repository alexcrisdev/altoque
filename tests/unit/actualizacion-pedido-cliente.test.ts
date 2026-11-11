import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const controles = vi.hoisted(() => ({
  refresh: vi.fn(), limpiezas: [] as (() => void)[],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: controles.refresh }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (efecto: () => void | (() => void)) => {
    const limpiar = efecto();
    if (limpiar) controles.limpiezas.push(limpiar);
  },
  useTransition: () => [false, (accion: () => void) => accion()],
}));
import { ActualizacionAutomatica } from "../../src/components/actualizacion-automatica";

afterEach(() => {
  controles.limpiezas.forEach((limpiar) => limpiar());
  controles.limpiezas = [];
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

it("la página configura 5 segundos y refresca sin recargar el documento", () => {
  const pagina = readFileSync("src/app/m/[token]/pedido/[clave]/page.tsx", "utf8");
  const segundos = Number(pagina.match(/<ActualizacionAutomatica segundos=\{(\d+)\}/)?.[1]);
  expect(segundos).toBe(5);
  vi.useFakeTimers();
  const reload = vi.fn();
  vi.stubGlobal("window", {
    setInterval, clearInterval, location: { reload },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  renderToStaticMarkup(createElement(ActualizacionAutomatica, { segundos }));
  vi.advanceTimersByTime(4999);
  expect(controles.refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(controles.refresh).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
});
