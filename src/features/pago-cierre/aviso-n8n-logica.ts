import { createHmac } from "node:crypto";
import { centimosATexto } from "./pago-logica";

// US-086: aviso a n8n cuando un pago queda CONFIRMADO. Lógica pura (sin red ni
// base) para poder probar la firma y el contenido con pruebas unitarias.

export const EVENTO_PAGO_CONFIRMADO = "pago_confirmado";
export const CABECERA_FIRMA = "X-AlToque-Firma";
export const CABECERA_TIEMPO = "X-AlToque-Timestamp";
export const CABECERA_EVENTO = "X-AlToque-Evento";

export type ConfigN8n = { url: string; secreto: string };

// Sin las dos variables el aviso queda apagado (ej. en local o en CI) y el cobro
// sigue igual. Solo se acepta HTTPS, salvo localhost para desarrollo.
export function configuracionN8n(entorno: Record<string, string | undefined>): ConfigN8n | null {
  const url = entorno.N8N_WEBHOOK_URL?.trim();
  const secreto = entorno.N8N_WEBHOOK_SECRET?.trim();
  if (!url || !secreto) return null;
  if (secreto.length < 32) throw new Error("N8N_WEBHOOK_SECRET debe tener al menos 32 caracteres");
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error("N8N_WEBHOOK_URL no es una URL válida");
  }
  const local = destino.hostname === "localhost" || destino.hostname === "127.0.0.1";
  if (destino.protocol !== "https:" && !(local && destino.protocol === "http:")) {
    throw new Error("N8N_WEBHOOK_URL debe usar HTTPS");
  }
  if (destino.username || destino.password) throw new Error("N8N_WEBHOOK_URL no debe llevar credenciales");
  return { url: destino.toString(), secreto };
}

// Lo que se lee de la base para armar el aviso (ver aviso-n8n.ts).
export type DatosPagoConfirmado = {
  pagoId: string;
  restauranteId: string;
  restauranteNombre: string;
  cuenta:
    | { tipo: "MESA"; id: string; mesa: number | null }
    | { tipo: "PARA_LLEVAR"; id: string; pedido: number | null };
  metodo: "CASH" | "YAPE" | "CARD";
  enLinea: boolean; // true = pagado con Stripe por el cliente
  montoCentimos: number;
  confirmadoEn: string;
  platos: { nombre: string; cantidad: number; precioUnitarioCentimos: number; subtotalCentimos: number }[];
};

export type AvisoPagoConfirmado = {
  evento: typeof EVENTO_PAGO_CONFIRMADO;
  version: 1;
  id: string; // id del pago: n8n lo usa para ignorar avisos repetidos
  restaurante: { id: string; nombre: string };
  cuenta: { tipo: "MESA" | "PARA_LLEVAR"; id: string; mesa: number | null; pedido: number | null };
  pago: { metodo: "CASH" | "YAPE" | "CARD"; canal: "CAJA" | "ONLINE"; monto: string; moneda: "PEN"; confirmado_en: string };
  platos: { nombre: string; cantidad: number; precio_unitario: string; subtotal: string }[];
};

type LineaPedido = { product_name: string; quantity: number; unit_price: number | string; subtotal: number | string };

// Une las líneas iguales (mismo plato y precio) de todos los pedidos de la cuenta:
// "Ceviche x1" + "Ceviche x2" = "Ceviche x3". Orden alfabético para que sea estable.
export function agruparPlatos(lineas: LineaPedido[]): DatosPagoConfirmado["platos"] {
  const porPlato = new Map<string, DatosPagoConfirmado["platos"][number]>();
  for (const linea of lineas) {
    const precio = Math.round(Number(linea.unit_price) * 100);
    const clave = `${linea.product_name}|${precio}`;
    const actual = porPlato.get(clave);
    const subtotal = Math.round(Number(linea.subtotal) * 100);
    if (actual) {
      actual.cantidad += linea.quantity;
      actual.subtotalCentimos += subtotal;
    } else {
      porPlato.set(clave, { nombre: linea.product_name, cantidad: linea.quantity, precioUnitarioCentimos: precio, subtotalCentimos: subtotal });
    }
  }
  return [...porPlato.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.precioUnitarioCentimos - b.precioUnitarioCentimos);
}

// Solo datos mínimos: sin teléfono ni nombre del cliente, sin observaciones de
// los platos, sin referencias de voucher ni claves. Montos en texto "12.50"
// para no depender de decimales de JavaScript.
export function construirAvisoPago(datos: DatosPagoConfirmado): AvisoPagoConfirmado {
  return {
    evento: EVENTO_PAGO_CONFIRMADO,
    version: 1,
    id: datos.pagoId,
    restaurante: { id: datos.restauranteId, nombre: datos.restauranteNombre },
    cuenta: {
      tipo: datos.cuenta.tipo,
      id: datos.cuenta.id,
      mesa: datos.cuenta.tipo === "MESA" ? datos.cuenta.mesa : null,
      pedido: datos.cuenta.tipo === "PARA_LLEVAR" ? datos.cuenta.pedido : null,
    },
    pago: {
      metodo: datos.metodo,
      canal: datos.enLinea ? "ONLINE" : "CAJA",
      monto: centimosATexto(datos.montoCentimos),
      moneda: "PEN",
      confirmado_en: datos.confirmadoEn,
    },
    platos: datos.platos.map((p) => ({
      nombre: p.nombre,
      cantidad: p.cantidad,
      precio_unitario: centimosATexto(p.precioUnitarioCentimos),
      subtotal: centimosATexto(p.subtotalCentimos),
    })),
  };
}

// Firma HMAC-SHA256 de "<timestamp>.<cuerpo>". Incluir la hora evita que alguien
// reenvíe un aviso viejo capturado: n8n rechaza firmas de más de 5 minutos.
export function firmarAviso(cuerpo: string, secreto: string, timestamp: number): string {
  return createHmac("sha256", secreto).update(`${timestamp}.${cuerpo}`, "utf8").digest("hex");
}

export function cabecerasAviso(cuerpo: string, secreto: string, timestamp: number): Record<string, string> {
  return {
    "Content-Type": "application/json",
    [CABECERA_EVENTO]: EVENTO_PAGO_CONFIRMADO,
    [CABECERA_TIEMPO]: String(timestamp),
    [CABECERA_FIRMA]: `sha256=${firmarAviso(cuerpo, secreto, timestamp)}`,
  };
}
