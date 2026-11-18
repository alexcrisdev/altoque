// US-099: cálculos puros del panel del dueño en vivo. Imports relativos (pruebas unitarias).

export type Comparacion = {
  hoy: number | null;
  ayer: number | null;
  /** Variación porcentual contra ayer; null si no se puede comparar (ayer 0 o sin datos). */
  variacionPct: number | null;
};

/** Compara el valor de hoy contra ayer sin dividir entre cero. */
export function compararConAyer(hoy: number | null, ayer: number | null): Comparacion {
  const valido = (n: number | null) => n !== null && Number.isFinite(n);
  if (!valido(hoy) || !valido(ayer) || ayer === 0) {
    return { hoy: valido(hoy) ? hoy : null, ayer: valido(ayer) ? ayer : null, variacionPct: null };
  }
  return { hoy, ayer, variacionPct: Math.round(((hoy! - ayer!) / Math.abs(ayer!)) * 100) };
}

/** Ticket promedio en céntimos; 0 cuando no hubo cuentas pagadas. */
export function ticketPromedio(ventasCentimos: number, cuentas: number): number {
  if (!Number.isFinite(ventasCentimos) || !Number.isFinite(cuentas) || cuentas <= 0) return 0;
  return Math.round(ventasCentimos / cuentas);
}

export type PagoHora = { confirmed_at: string | null; amount: number | string; status: string };

const horaLima = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Lima",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Ventas confirmadas por hora de Lima (24 posiciones, en céntimos). */
export function ventasPorHora(pagos: readonly PagoHora[]): number[] {
  const horas = Array.from({ length: 24 }, () => 0);
  for (const pago of pagos) {
    if (pago.status !== "CONFIRMED" || !pago.confirmed_at) continue;
    const ms = Date.parse(pago.confirmed_at);
    const monto = Math.round(Number(pago.amount) * 100);
    if (!Number.isFinite(ms) || !Number.isFinite(monto) || monto <= 0) continue;
    const hora = Number(horaLima.format(new Date(ms))) % 24;
    horas[hora] += monto;
  }
  return horas;
}

export type EstadoMesa = "LIBRE" | "OCUPADA" | "ESPERA_PAGO";

/**
 * Libre: sin sesión abierta. Ocupada: sesión abierta.
 * Espera pago (US-094): la sesión abierta tiene pedidos PENDING.
 */
export function estadoMesas(
  mesas: readonly { id: string; numero: number }[],
  sesionesAbiertas: readonly { id: string; mesaId: string }[],
  sesionesConPendientes: ReadonlySet<string>,
): { id: string; numero: number; estado: EstadoMesa }[] {
  const sesionPorMesa = new Map(sesionesAbiertas.map((s) => [s.mesaId, s.id]));
  return [...mesas]
    .sort((a, b) => a.numero - b.numero)
    .map((mesa) => {
      const sesion = sesionPorMesa.get(mesa.id);
      const estado: EstadoMesa = !sesion
        ? "LIBRE"
        : sesionesConPendientes.has(sesion)
          ? "ESPERA_PAGO"
          : "OCUPADA";
      return { id: mesa.id, numero: mesa.numero, estado };
    });
}

export type StockDia = { nombre: string; cantidad: number; vendidos: number };

/** Stock bajo: quedan 1–3 unidades. Agotado: no queda nada o el plato está marcado no disponible. */
export function alertasStock(
  stock: readonly StockDia[],
  noDisponibles: readonly string[],
  umbral = 3,
): { bajo: { nombre: string; quedan: number }[]; agotados: string[] } {
  const bajo: { nombre: string; quedan: number }[] = [];
  const agotados = new Set(noDisponibles);
  for (const fila of stock) {
    const quedan = Math.max(0, fila.cantidad - fila.vendidos);
    if (quedan === 0) agotados.add(fila.nombre);
    else if (quedan <= umbral) bajo.push({ nombre: fila.nombre, quedan });
  }
  return {
    bajo: bajo.sort((a, b) => a.quedan - b.quedan || a.nombre.localeCompare(b.nombre, "es")),
    agotados: [...agotados].sort((a, b) => a.localeCompare(b, "es")),
  };
}

/** "YYYY-MM-DD" de Lima para hoy y ayer. */
export function fechasHoyAyer(ahora: number): { hoy: string; ayer: string } {
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const hoy = formato.format(new Date(ahora));
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { hoy, ayer };
}

/** Texto corto de la variación: "+12 % vs ayer", "Sin dato de ayer". */
export function textoVariacion(c: Comparacion): string {
  if (c.variacionPct === null) return c.ayer === 0 ? "Ayer sin datos" : "Sin dato de ayer";
  if (c.variacionPct === 0) return "Igual que ayer";
  return `${c.variacionPct > 0 ? "+" : "−"}${Math.abs(c.variacionPct)} % vs ayer`;
}
