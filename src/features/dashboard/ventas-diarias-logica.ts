import { createHash, timingSafeEqual } from "node:crypto";
import { fechasHoyAyer } from "./panel-vivo-logica";

// US-145: reglas puras de la consolidación diaria de ventas (sin base de datos).

export const DIAS_POR_DEFECTO = 7; // corrida diaria: corrige cancelaciones tardías y noches sin corrida
export const DIAS_MAXIMO = 35; // carga inicial: 4 semanas para US-146, más margen
export const LARGO_MINIMO_SECRETO = 32;

// Compara "Bearer <secreto>" en tiempo constante: se comparan los hash SHA-256 (mismo
// largo siempre), así ni el contenido ni el largo del token recibido cambian el tiempo.
export function autorizacionValida(recibida: string | null, secreto: string | undefined): boolean {
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) return false;
  const huella = (texto: string) => createHash("sha256").update(texto, "utf8").digest();
  return timingSafeEqual(huella(recibida ?? ""), huella(`Bearer ${secreto}`));
}

// Cuántos días recalcular: vacío = 7; si no es un entero entre 1 y 35, null (petición inválida).
export function leerDias(valor: string | null): number | null {
  if (valor === null || valor === "") return DIAS_POR_DEFECTO;
  if (!/^\d{1,2}$/.test(valor)) return null;
  const dias = Number(valor);
  return dias >= 1 && dias <= DIAS_MAXIMO ? dias : null;
}

// Rango de días ya terminados en Lima: termina ayer y abarca `dias` días.
export function rangoConsolidacion(ahora: number, dias: number): { desde: string; hasta: string } {
  const { ayer } = fechasHoyAyer(ahora);
  const desde = new Date(Date.parse(`${ayer}T12:00:00Z`) - (dias - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { desde, hasta: ayer };
}
