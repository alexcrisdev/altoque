import type { PedidoCocina } from "../../src/features/cocina/tipos";

export function crearPedido(numero: number): PedidoCocina {
  return {
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`, numero,
    creadoEn: new Date(Date.now() - (11 - numero) * 60000).toISOString(), estado: "IN_PROGRESS",
    modalidad: "DINE_IN", mesaNumero: 3, nombreCliente: null, asistido: false,
    items: [{ nombre: "Ceviche clásico", cantidad: 2, observacion: "Sin ají", alergenos: ["Pescado"] }], incidenciasAbiertas: [],
  };
}
declare global {
  interface Window {
    kds: { pedidos: PedidoCocina[]; llamadas: { id: string; deshacer: boolean }[]; consultas: number; fallar: boolean; tonos: number };
  }
}
window.kds = { pedidos: Array.from({ length: 10 }, (_, i) => crearPedido(10 - i)), llamadas: [], consultas: 0, fallar: false, tonos: 0 };
export async function obtenerKds() {
  window.kds.consultas++;
  if (window.kds.fallar) return { ok: false as const, restauranteId: "demo-local" };
  return { ok: true as const, restauranteId: "demo-local", actualizadoEn: Date.now(), pedidos: structuredClone(window.kds.pedidos) };
}
export async function cambiarEstadoKds(id: string, deshacer = false) {
  window.kds.llamadas.push({ id, deshacer });
  const pedido = window.kds.pedidos.find((p) => p.id === id)!;
  pedido.estado = deshacer ? "IN_PROGRESS" : "READY";
  pedido.listoEn = deshacer ? null : new Date().toISOString();
  return { ok: true as const };
}
