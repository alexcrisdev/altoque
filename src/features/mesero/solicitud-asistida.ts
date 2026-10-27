// Reglas puras del pedido asistido (sin base de datos), para poder probarlas.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// En el local va con una mesa; para llevar va con un local y sin mesa.
export type SolicitudAsistida =
  | { modalidad: "DINE_IN"; mesaId: string; localId: null }
  | { modalidad: "TAKEAWAY"; mesaId: null; localId: string };

export type MotivoRechazo =
  | "SIN_PERMISO"
  | "MESA_NO_DISPONIBLE"
  | "MESA_SIN_SESION"
  | "LOCAL_NO_DISPONIBLE"
  | "PRODUCTO_NO_DISPONIBLE"
  | "DATOS_INVALIDOS"
  | "ERROR";

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

// Lo que llega del navegador no es confiable: se copian solo los campos válidos.
export function validarSolicitudAsistida(entrada: unknown): SolicitudAsistida | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const { modalidad, mesaId, localId } = entrada as Record<string, unknown>;

  if (modalidad === "DINE_IN" && esUuid(mesaId)) {
    return { modalidad, mesaId: mesaId.toLowerCase(), localId: null };
  }
  if (modalidad === "TAKEAWAY" && esUuid(localId) && (mesaId === null || mesaId === undefined)) {
    return { modalidad, mesaId: null, localId: localId.toLowerCase() };
  }
  return null;
}

// La función de la base avisa el problema con un texto fijo (ej. TABLE_SESSION_CLOSED).
export function motivoDeError(mensaje: string | undefined): MotivoRechazo {
  if (!mensaje) return "ERROR";
  if (mensaje.includes("FORBIDDEN")) return "SIN_PERMISO";
  if (mensaje.includes("TABLE_SESSION_CLOSED")) return "MESA_SIN_SESION";
  if (mensaje.includes("TABLE_UNAVAILABLE")) return "MESA_NO_DISPONIBLE";
  if (mensaje.includes("BRANCH_UNAVAILABLE")) return "LOCAL_NO_DISPONIBLE";
  if (mensaje.includes("PRODUCT_UNAVAILABLE")) return "PRODUCTO_NO_DISPONIBLE";
  if (mensaje.includes("INVALID_ITEMS") || mensaje.includes("INVALID_REQUEST")) return "DATOS_INVALIDOS";
  return "ERROR";
}

export function mensajeRechazo(motivo: MotivoRechazo): string {
  switch (motivo) {
    case "SIN_PERMISO":
      return "No tienes permiso para registrar pedidos en este restaurante.";
    case "MESA_NO_DISPONIBLE":
      return "Esa mesa no está disponible.";
    case "MESA_SIN_SESION":
      return "La mesa no tiene una sesión abierta. Ábrela antes de registrar el pedido.";
    case "LOCAL_NO_DISPONIBLE":
      return "Ese local no está disponible.";
    case "PRODUCTO_NO_DISPONIBLE":
      return "Algún producto ya no está disponible. Actualiza la página y revisa el pedido.";
    case "DATOS_INVALIDOS":
      return "El pedido tiene datos inválidos. Revisa la mesa y los productos.";
    case "ERROR":
      return "No se pudo registrar el pedido. Intenta de nuevo.";
  }
}
