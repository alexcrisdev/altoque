import type { AlergiaFormulario } from "../pedidos/alergias";

export function cambiarRespuestaAlergia(
  actual: AlergiaFormulario,
  respuesta: "NONE" | "YES",
): AlergiaFormulario {
  if (actual.respuesta === respuesta) return actual;
  return { respuesta, alergenos: [], detalle: "", aceptada: false };
}
