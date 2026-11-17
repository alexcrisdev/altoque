import type { Calificacion } from "./calificacion-logica";

export const claveCierreCalificacion = (clave: string) => `altoque:calificacion-cerrada:${clave}`;

// Cerrar es una decisión del navegador: no llama a la acción de servidor.
export async function resolverDecisionCalificacion<T>(
  decision: { tipo: "cerrar" } | { tipo: "guardar"; datos: Calificacion },
  recordar: () => void,
  guardar: (datos: Calificacion) => Promise<T>,
): Promise<T | null> {
  if (decision.tipo === "cerrar") { recordar(); return null; }
  return guardar(decision.datos);
}
