// US-088: validación compartida, sin acceso a la base ni datos del entorno.
export function leerCorreoBoleta(valor: unknown): { ok: true; correo: string | null } | { ok: false; mensaje: string } {
  if (valor === undefined || valor === null || valor === "") return { ok: true, correo: null };
  if (typeof valor !== "string") return { ok: false, mensaje: "Escribe un correo válido para tu boleta." };
  const correo = valor.trim();
  if (!correo) return { ok: true, correo: null };
  if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { ok: false, mensaje: "Escribe un correo válido para tu boleta (máximo 254 caracteres)." };
  }
  return { ok: true, correo };
}

export type ResultadoComprobante = {
  pago_id: string;
  serie: string;
  numero: number;
  estado: "EMITIDO" | "ERROR";
  enlace_pdf: string | null;
  enlace_xml: string | null;
};

export type ComprobanteCuenta = {
  series: string; number: number; status: "PENDIENTE" | "EMITIDO" | "ERROR";
  pdf_url: string | null; xml_url: string | null; is_test: boolean;
};

function enlaceSeguro(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length > 2048) return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function leerResultadoComprobante(valor: unknown): ResultadoComprobante | null {
  if (!valor || typeof valor !== "object") return null;
  const dato = valor as Record<string, unknown>;
  if (typeof dato.pago_id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(dato.pago_id)
    || typeof dato.serie !== "string" || !/^B[A-Z0-9]{3}$/.test(dato.serie)
    || !Number.isInteger(dato.numero) || Number(dato.numero) < 1 || Number(dato.numero) > 99999999
    || (dato.estado !== "EMITIDO" && dato.estado !== "ERROR")) return null;
  if (dato.estado === "EMITIDO" && (!enlaceSeguro(dato.enlace_pdf) || !enlaceSeguro(dato.enlace_xml))) return null;
  return {
    pago_id: dato.pago_id, serie: dato.serie, numero: Number(dato.numero), estado: dato.estado,
    enlace_pdf: dato.estado === "EMITIDO" ? dato.enlace_pdf as string : null,
    enlace_xml: dato.estado === "EMITIDO" ? dato.enlace_xml as string : null,
  };
}
