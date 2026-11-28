import { useLayoutEffect, type RefObject } from "react";

// US-127: con cacheComponents, Next 16 no desmonta la página al navegar: la deja oculta con
// <Activity mode="hidden"> y conserva sus diálogos ABIERTOS. Un <dialog> abierto con showModal()
// vuelve inerte todo lo demás del documento, así que la página nueva se ve bien pero sus botones
// no responden hasta recargar. Este hook cierra el diálogo cuando su pantalla se oculta o se
// desmonta (la limpieza de useLayoutEffect corre en ambos casos, como recomienda la guía de Next
// «Preserving UI state»).
export function useCerrarDialogoAlOcultar(ref: RefObject<HTMLDialogElement | null>): void {
  useLayoutEffect(() => {
    const dialogo = ref.current;
    return () => {
      if (dialogo?.open) dialogo.close();
    };
  }, [ref]);
}
