// Reglas puras de la modalidad de consumo (sin base de datos), para poder probarlas.

export type Modalidad = "DINE_IN" | "TAKEAWAY";

// Qué datos pide el restaurante en los pedidos para llevar.
export type ConfigParaLlevar = { pideNombre: boolean; pideTelefono: boolean };

export type OpcionesPedido = {
  modalidad: Modalidad;
  nombre: string | null;
  telefono: string | null;
};

export type ResultadoModalidad =
  | ({ ok: true } & OpcionesPedido)
  | { ok: false; mensaje: string };

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 60;
const TELEFONO = /^\+?[0-9]{7,15}$/;

// "987 654-321" -> "987654321". Espacios y guiones no cuentan.
export function normalizarTelefono(texto: string): string {
  return texto.replace(/[\s-]/g, "");
}

// Qué falta para poder confirmar (sirve en el navegador y en el servidor).
export function datosFaltantes(
  modalidad: Modalidad,
  nombre: string,
  telefono: string,
  config: ConfigParaLlevar,
): string | null {
  if (modalidad !== "TAKEAWAY") return null;
  const nombreLimpio = nombre.trim();
  const telefonoLimpio = normalizarTelefono(telefono);

  if (config.pideNombre && !nombreLimpio) return "Escribe tu nombre para el pedido para llevar.";
  if (nombreLimpio && (nombreLimpio.length < NOMBRE_MIN || nombreLimpio.length > NOMBRE_MAX)) {
    return `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
  }
  if (config.pideTelefono && !telefonoLimpio) return "Escribe tu teléfono para el pedido para llevar.";
  if (telefonoLimpio && !TELEFONO.test(telefonoLimpio)) return "El teléfono debe tener solo números (7 a 15).";
  return null;
}

// Lo que manda el navegador no es confiable: se revisa contra el QR y la configuración.
// - QR de mesa: el cliente puede elegir en el local (conserva la mesa) o para llevar.
// - QR de mostrador: solo para llevar.
export function validarModalidad(
  entrada: unknown,
  modalidadQr: Modalidad,
  config: ConfigParaLlevar,
): ResultadoModalidad {
  // Sin opciones (versión anterior del cliente): se usa la modalidad del QR.
  const datos = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
  const modalidad = datos.modalidad ?? modalidadQr;

  if (modalidad !== "DINE_IN" && modalidad !== "TAKEAWAY") {
    return { ok: false, mensaje: "Elige si comes en el local o es para llevar." };
  }
  if (modalidadQr === "TAKEAWAY" && modalidad === "DINE_IN") {
    return { ok: false, mensaje: "Este código QR es solo para pedidos para llevar." };
  }
  if (modalidad === "DINE_IN") return { ok: true, modalidad, nombre: null, telefono: null };

  const nombre = typeof datos.nombre === "string" ? datos.nombre : "";
  const telefono = typeof datos.telefono === "string" ? datos.telefono : "";
  const falta = datosFaltantes(modalidad, nombre, telefono, config);
  if (falta) return { ok: false, mensaje: falta };

  return {
    ok: true,
    modalidad,
    nombre: nombre.trim() || null,
    telefono: normalizarTelefono(telefono) || null,
  };
}

// Cómo ve el personal el destino de un pedido: "Mesa 3" o "Para llevar · Ana · 987654321".
export function describirDestino(pedido: {
  modalidad: Modalidad;
  mesaNumero: number | null;
  nombre: string | null;
  telefono: string | null;
}): string {
  if (pedido.modalidad === "DINE_IN") {
    return pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "En el local";
  }
  return ["Para llevar", pedido.nombre, pedido.telefono].filter(Boolean).join(" · ");
}
