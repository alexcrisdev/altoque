import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// US-127: un <dialog> modal abierto en una página que Next 16 deja oculta (Activity) volvía
// inerte la página nueva. El hook lo cierra al ocultarse o desmontarse.
const efecto = vi.hoisted(() => ({ fn: null as null | (() => void | (() => void)) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useLayoutEffect: (fn: () => void | (() => void)) => { efecto.fn = fn; },
}));

import { useCerrarDialogoAlOcultar } from "../../src/lib/cerrar-dialogo-al-ocultar";

function usePreparar(open: boolean) {
  const dialogo = { open, close: vi.fn() } as unknown as HTMLDialogElement;
  useCerrarDialogoAlOcultar({ current: dialogo });
  const limpiar = efecto.fn!();
  return { dialogo, limpiar: limpiar as () => void };
}

describe("useCerrarDialogoAlOcultar", () => {
  it("al ocultarse la pantalla, cierra el diálogo abierto", () => {
    const { dialogo, limpiar } = usePreparar(true);
    expect(dialogo.close).not.toHaveBeenCalled();
    limpiar();
    expect(dialogo.close).toHaveBeenCalledTimes(1);
  });

  it("si ya estaba cerrado, no hace nada", () => {
    const { dialogo, limpiar } = usePreparar(false);
    limpiar();
    expect(dialogo.close).not.toHaveBeenCalled();
  });

  it("lo usan todos los diálogos modales de la app", () => {
    for (const archivo of [
      "src/features/pedidos/panel-carrito.tsx",
      "src/features/carta/carta-interactiva.tsx",
      "src/features/pago-cierre/elegir-pago-en-caja.tsx",
      "src/features/plano-mesas/vistas-plano.tsx",
      "src/components/toqui/toqui.tsx",
    ]) {
      const codigo = readFileSync(archivo, "utf8");
      expect(codigo, archivo).toContain("showModal");
      expect(codigo, archivo).toMatch(/useCerrarDialogoAlOcultar\(/);
    }
  });
});
