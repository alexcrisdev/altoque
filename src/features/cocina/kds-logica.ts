import type { PedidoCocina } from "./tipos";
import { ordenarPorLlegada } from "./cocina-logica";

export const PLAZO_DESHACER_KDS = 5000;

export const ETIQUETA_ESPERA = {
  verde: "En tiempo",
  amarillo: "Espera prolongada",
  rojo: "Atención prioritaria",
};

// Una tecla no cambia de pedido silenciosamente. Las asignaciones de pedidos
// que salieron se reservan hasta que el cocinero pulse Reasignar teclas.
export function asignarAtajos(pedidos: readonly PedidoCocina[], anteriores: Readonly<Record<string, number>> = {}): Record<string, number> {
  const asignaciones = { ...anteriores };
  const usados = new Set(Object.values(asignaciones));
  for (const pedido of ordenarPorLlegada([...pedidos])) {
    if (pedido.estado !== "IN_PROGRESS" || asignaciones[pedido.id] !== undefined) continue;
    const libre = Array.from({ length: 9 }, (_, i) => i + 1).find((n) => !usados.has(n));
    if (libre === undefined) break;
    asignaciones[pedido.id] = libre;
    usados.add(libre);
  }
  return asignaciones;
}

export function crearSeguimientoNuevos() {
  const conocidos = new Set<string>();
  let iniciado = false;
  return (pedidos: readonly PedidoCocina[]) => {
    const nuevos = iniciado && pedidos.some((p) => p.estado === "IN_PROGRESS" && !conocidos.has(p.id));
    for (const pedido of pedidos) conocidos.add(pedido.id);
    iniciado = true;
    return nuevos;
  };
}

export function diaLima(ahora: number) {
  const fecha = new Date(ahora - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const inicio = new Date(`${fecha}T00:00:00-05:00`).getTime();
  return { inicio: new Date(inicio).toISOString(), fin: new Date(inicio + 86400000).toISOString() };
}

export function pedidosDelDia(pedidos: PedidoCocina[], ahora: number) {
  const { inicio, fin } = diaLima(ahora);
  return ordenarPorLlegada(pedidos.filter((p) => {
    const fecha = Date.parse(p.creadoEn);
    return fecha >= Date.parse(inicio) && fecha < Date.parse(fin);
  }));
}

export function resumenPreparacion(pedidos: PedidoCocina[]) {
  const cantidades = new Map<string, number>();
  for (const pedido of pedidos) {
    if (pedido.estado !== "IN_PROGRESS") continue;
    for (const item of pedido.items) cantidades.set(item.nombre, (cantidades.get(item.nombre) ?? 0) + item.cantidad);
  }
  return [...cantidades].map(([nombre, cantidad]) => ({ nombre, cantidad }));
}

export function colorEspera(creadoEn: string, ahora: number) {
  const espera = ahora - Date.parse(creadoEn);
  return espera >= 20 * 60000 ? "rojo" : espera >= 10 * 60000 ? "amarillo" : "verde";
}

// Ventana de interfaz desde que se muestra la confirmación, no la regla SQL.
export function deshacerVigente(confirmadoEn: string | null | undefined, ahora: number) {
  const edad = ahora - Date.parse(confirmadoEn ?? "");
  return Number.isFinite(edad) && edad >= 0 && edad < PLAZO_DESHACER_KDS;
}

export function numeroAtajo(evento: { key: string; code: string; repeat: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, editando: boolean) {
  if (editando || evento.repeat || evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return null;
  const tecla = /^Numpad[0-9]$/.test(evento.code) ? evento.code.slice(-1) : evento.key;
  return /^[0-9]$/.test(tecla) ? Number(tecla) : null;
}
