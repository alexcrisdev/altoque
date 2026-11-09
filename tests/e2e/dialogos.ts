import type { Dialog, Page } from "@playwright/test";

// Un único responsable por diálogo. El clic nativo espera a que se resuelva.
export async function aceptarDialogoDeAccion(
  page: Page,
  accion: () => Promise<unknown>,
  tipo: "prompt" | "confirm",
  mensaje: string,
  respuesta?: string,
) {
  // Page hereda EventEmitter en Node, aunque su interfaz pública no declara
  // listenerCount. Comprobarlo antes de usarlo y detenerse si no está disponible.
  if (!("listenerCount" in page) || typeof page.listenerCount !== "function") {
    throw new Error("No se pudieron verificar los manejadores de diálogo; no se ejecuta la acción.");
  }
  if (page.listenerCount("dialog") > 0) {
    throw new Error("Hay un manejador de diálogo pendiente; se detiene la acción para evitar aceptarlo dos veces.");
  }
  let resultado: Promise<{ error?: unknown }> | undefined;
  const manejar = (dialogo: Dialog) => {
    // Capturar el rechazo desde el inicio evita promesas rechazadas sin manejar.
    resultado = (async () => {
      if (dialogo.type() !== tipo || dialogo.message() !== mensaje) {
        await dialogo.dismiss();
        throw new Error("La acción abrió un diálogo distinto del esperado.");
      }
      await dialogo.accept(respuesta);
    })().then(() => ({}), (error: unknown) => ({ error }));
  };
  page.once("dialog", manejar);
  try {
    await accion();
    if (!resultado) throw new Error("La acción no abrió el diálogo esperado.");
    const resuelto = await resultado;
    if ("error" in resuelto) throw resuelto.error;
  } finally {
    // También retirar el listener si el clic falla antes de abrir el diálogo.
    page.off("dialog", manejar);
  }
}
