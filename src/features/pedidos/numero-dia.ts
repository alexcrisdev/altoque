// US-105: el número de pedido empieza en 1 cada día (por restaurante, hora de Lima).
// Donde se mezclan días (admin, caja), el número va junto con la fecha: "N.º 5 · 26/11".
export function fechaCortaPedido(fecha: string | null | undefined): string | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

export function etiquetaNumeroDia(numero: number, fecha: string | null | undefined): string {
  const corta = fechaCortaPedido(fecha);
  return corta ? `N.º ${numero} · ${corta}` : `N.º ${numero}`;
}
