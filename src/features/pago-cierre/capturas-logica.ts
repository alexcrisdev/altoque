export const MAX_CAPTURA = 400 * 1024;
export const OBJETIVO_CAPTURA = 300 * 1024;
export const ESPERA_CONFIRMACION = 10_000;
export type Billetera = "YAPE" | "PLIN";
export type ResultadoCaptura = "COMPLETE" | "OTHER" | "NOT_RECEIVED";
export function motivoRechazoCaptura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return [...texto].length >= 5 && [...texto].length <= 120 && !/[\u0000-\u001f\u007f]/.test(texto) ? texto : null;
}
export type CapturaPendiente = {
  id: string; titulo: string; wallet: Billetera; esperado: number; declarado: number;
  creadaEn: string; duplicada: boolean; eliminada: boolean;
  // US-105: saldo de la cuenta ahora (céntimos); null si no se pudo consultar.
  saldoActual?: number | null;
};
// US-105: cuánto excede lo declarado al saldo actual (0 si no excede o no se sabe).
export function excedenteCaptura(captura: Pick<CapturaPendiente, "declarado" | "saldoActual">): number {
  if (captura.saldoActual === null || captura.saldoActual === undefined) return 0;
  return Math.max(0, captura.declarado - Math.max(0, captura.saldoActual));
}
export function dimensionesCaptura(ancho: number, alto: number) {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) throw new Error("Imagen inválida");
  const escala = Math.min(1, 1280 / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}
export function tipoImagen(bytes: Uint8Array): "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
export function segundosTranscurridos(fecha: string, ahora: number) {
  return Math.max(0, Math.floor((ahora - Date.parse(fecha)) / 1000)) || 0;
}
export function tiempoCaptura(fecha: string, ahora: number) {
  const segundos = segundosTranscurridos(fecha, ahora);
  return `${Math.floor(segundos / 60).toString().padStart(2, "0")}:${(segundos % 60).toString().padStart(2, "0")}`;
}
export function requiereAvisoCaptura(fecha: string, ahora: number) {
  return segundosTranscurridos(fecha, ahora) >= 180;
}
// Se reutiliza para que Deshacer cancele exactamente la llamada pendiente.
export function programarConfirmacion(confirmar: () => void, demora = ESPERA_CONFIRMACION) {
  const id = setTimeout(confirmar, demora);
  return () => clearTimeout(id);
}
export function inicioDiaLima(ahora = new Date()) {
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  return new Date(`${fecha}T00:00:00-05:00`).toISOString();
}
