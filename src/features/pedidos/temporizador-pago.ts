export const MINUTOS_PARA_PAGAR = 15;
const MILISEGUNDOS_POR_MINUTO = 60_000;

export function calcularLimitePago(creadoEn: string): string {
  return new Date(Date.parse(creadoEn) + MINUTOS_PARA_PAGAR * MILISEGUNDOS_POR_MINUTO).toISOString();
}

export function calcularTiempoRestante(limite: string, ahora: number | Date = Date.now()): {
  segundos: number;
  vencido: boolean;
} {
  const limiteMs = Date.parse(limite);
  if (!Number.isFinite(limiteMs)) return { segundos: 0, vencido: true };
  const milisegundos = limiteMs - (ahora instanceof Date ? ahora.getTime() : ahora);
  const segundos = Math.max(0, Math.ceil(milisegundos / 1000));
  return { segundos, vencido: segundos === 0 };
}
