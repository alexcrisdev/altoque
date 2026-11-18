export type Calificacion = { servicio: number; mesero: number; comentario: string | null };

export function validarCalificacion(entrada: unknown): Calificacion | null {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const { servicio, mesero, comentario } = entrada as Record<string, unknown>;
  const estrellas = (valor: unknown): valor is number => typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= 5;
  if (!estrellas(servicio) || !estrellas(mesero)) return null;
  if (comentario !== null && typeof comentario !== "string") return null;
  if (typeof comentario === "string" && (Array.from(comentario).length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(comentario))) return null;
  return { servicio, mesero, comentario: typeof comentario === "string" ? comentario.trim() || null : null };
}

export function esClavePedido(clave: unknown): clave is string {
  return typeof clave === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clave);
}
