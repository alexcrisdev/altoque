"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function FichaPlano({ abierta, cerrar, titulo, local, children }: {
  abierta: boolean; cerrar: () => void; titulo: string; local: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (abierta && el && !el.open) el.showModal();
    if (!abierta && el?.open) el.close();
  }, [abierta]);
  return <dialog ref={ref} className="plano-ficha" aria-labelledby={id} onClose={cerrar}
    onClick={e => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
    }}>
    <div className="grid gap-3">
      <header className="plano-cabecera"><div><span>{local}</span><h2 id={id}>{titulo}</h2></div>
        <button type="button" className="plano-cerrar" aria-label="Cerrar ficha" onClick={() => ref.current?.close()}>×</button>
      </header>
      {children}
    </div>
  </dialog>;
}
