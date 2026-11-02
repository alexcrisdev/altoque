"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const AvisoCocina = createContext<((mensaje: string) => void) | null>(null);

export function useAvisoCocina() {
  return useContext(AvisoCocina);
}

// Mantener el aviso visible incluso si el pedido cancelado desaparece al refrescar.
export function AvisosCocina({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState("");
  return <AvisoCocina.Provider value={setMensaje}>
    {mensaje && <p role="alert" className="mb-4 rounded-lg bg-peligro-fondo p-3 text-peligro-texto">{mensaje}</p>}
    {children}
  </AvisoCocina.Provider>;
}
