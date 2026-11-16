export const ALERGENOS = {
  MANI: "Maní", MARISCOS: "Mariscos", PESCADO: "Pescado",
  GLUTEN: "Gluten", LACTEOS: "Lácteos", HUEVO: "Huevo",
} as const;
export type Alergeno = keyof typeof ALERGENOS;
export const DECLARACION_ALERGIA = "Entiendo que la cocina hará lo posible por evitar el alérgeno, pero puede haber trazas.";
export type AlergiaFormulario = {
  respuesta: "NONE" | "YES" | null;
  alergenos: Alergeno[];
  detalle: string;
  aceptada: boolean;
};
export const ALERGIA_INICIAL: AlergiaFormulario = {
  respuesta: null, alergenos: [], detalle: "", aceptada: false,
};
export type AlergiaPedido = {
  respuesta: "NONE" | "YES";
  alergenos: Alergeno[];
  detalle: string | null;
};
export type FilaAlergia = {
  allergy_answer: "NONE" | "YES" | null;
  allergens: string[];
  allergy_note: string | null;
};

export function validarAlergia(entrada: unknown):
  { ok: true; alergia: AlergiaPedido } | { ok: false; mensaje: string } {
  const dato = entrada && typeof entrada === "object" ? entrada as Record<string, unknown> : {};
  if (dato.respuesta !== "NONE" && dato.respuesta !== "YES") {
    return { ok: false, mensaje: "Responde si alguien tiene alergias antes de confirmar." };
  }
  if (!Array.isArray(dato.alergenos) || dato.alergenos.length > 6 ||
    dato.alergenos.some((a) => typeof a !== "string" || !Object.hasOwn(ALERGENOS, a)) ||
    typeof dato.detalle !== "string" || [...dato.detalle].length > 120) {
    return { ok: false, mensaje: "Revisa los alérgenos y el detalle (máximo 120 caracteres)." };
  }
  const alergenos = [...new Set(dato.alergenos)] as Alergeno[];
  const detalle = dato.detalle.trim() || null;
  if (dato.respuesta === "NONE") {
    if (alergenos.length || detalle) return { ok: false, mensaje: "Selecciona Sí para declarar una alergia." };
    return { ok: true, alergia: { respuesta: "NONE", alergenos: [], detalle: null } };
  }
  if (!alergenos.length && !detalle) return { ok: false, mensaje: "Marca un alérgeno o escribe un detalle." };
  if (dato.aceptada !== true) return { ok: false, mensaje: "Lee y acepta la declaración informativa sobre posibles trazas." };
  return { ok: true, alergia: { respuesta: "YES", alergenos, detalle } };
}

export function textoAlergia(alergia?: AlergiaPedido | null): string | null {
  if (alergia?.respuesta !== "YES") return null;
  const nombres = [...new Set(alergia.alergenos)].map((codigo) => ALERGENOS[codigo]).filter(Boolean);
  return `Alergia: ${[nombres.join(", "), alergia.detalle?.trim()].filter(Boolean).join(" — ")}`;
}

export function leerAlergia(fila: Partial<FilaAlergia>): AlergiaPedido | null {
  if (fila.allergy_answer !== "YES" && fila.allergy_answer !== "NONE") return null;
  return {
    respuesta: fila.allergy_answer,
    alergenos: (fila.allergens ?? []).filter((a): a is Alergeno => Object.hasOwn(ALERGENOS, a)),
    detalle: fila.allergy_note ?? null,
  };
}
