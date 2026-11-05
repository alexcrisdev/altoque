"use client";

import { useState, type ReactNode } from "react";

// Conservar el último panel correcto si falla la siguiente consulta al servidor.
export function ContenidoConservado({ actualizadoEn, error, children }: {
  actualizadoEn: string | null; error: boolean; children: ReactNode;
}) {
  const [ultimo, setUltimo] = useState({ actualizadoEn, children });
  if (!error && actualizadoEn !== ultimo.actualizadoEn) {
    setUltimo({ actualizadoEn, children });
  }
  return <>
    {error && ultimo.actualizadoEn && <p role="status" className="mb-4 text-aviso-texto">
      No se pudo actualizar. Conservamos los últimos pedidos y volveremos a intentarlo.
    </p>}
    {error ? ultimo.children : children}
  </>;
}