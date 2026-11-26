import { mensajeErrorModificacion } from "./modificacion";

const MENSAJES: Readonly<Record<string, string>> = {
  PAYMENT_CONFIRMED: "Este pedido ya tiene un pago confirmado y no se puede modificar.",
  PAYMENT_PENDING: "Tu pago está pendiente de verificación. Espera a que caja lo revise.",
  CHECKOUT_OPEN: "Hay un pago con tarjeta en curso. Si no pagaste, podrás modificar el pedido cuando venza el intento y el pedido siga vigente.",
  ORDER_EXPIRED: "Venció el tiempo para modificar este pedido.",
  ORDER_CHANGED: "El pedido cambió. Abre el editor otra vez para ver la versión actual.",
  ORDER_BUSY: "El pedido se está actualizando. Intenta guardar de nuevo en unos segundos.",
  STOCK_INSUFFICIENT: "Ya no hay stock suficiente para esa cantidad. Reduce la cantidad e inténtalo nuevamente.",
  PRODUCT_UNAVAILABLE: "El plato ya no está disponible. Puedes reducir la cantidad o quitarlo.",
  CANCEL_CONFIRMATION_REQUIRED: "Confirma la anulación para quitar todos los platos.",
};

export function mensajeErrorEdicionCliente(codigo: string) {
  return Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : mensajeErrorModificacion(codigo);
}
