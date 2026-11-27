import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock(import("../../src/features/dashboard/pedidos-de-prueba"), async (original) => ({
  ...await original(), obtenerIdsPedidosDePrueba: vi.fn(async () => new Set(["prueba"])),
}));
vi.mock("../../src/features/dashboard/tendencias", () => ({ obtenerTendencias: vi.fn(async () => ({ productos: [] })) }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerPanelVivo } from "../../src/features/dashboard/panel-vivo";
import { obtenerIdsPedidosDePrueba } from "../../src/features/dashboard/pedidos-de-prueba";

type Fila = Record<string, unknown>;
type Lectura = { tabla: string; filtros: [string, string, unknown][]; limite: number | null };
const restaurante = "r1";
const ahora = Date.parse("2026-11-26T20:30:00Z");
const dia = (fecha: string, hora = "20:00:00") => `${fecha}T${hora}.000Z`;
const pedido = (id: string, fecha = "2026-11-26", extra: Fila = {}): Fila => ({
  id, restaurant_id: restaurante, status: "DELIVERED", created_at: dia(fecha),
  table_session_id: null, order_items: [{ product_name: "Plato" }], ...extra,
});
const pago = (id: string, order_id: string | null, fecha = "2026-11-26", extra: Fila = {}): Fila => ({
  id, restaurant_id: restaurante, order_id, table_session_id: null, method: "CASH",
  status: "CONFIRMED", amount: 10, confirmed_at: dia(fecha), ...extra,
});

// Doble de consulta: aplica límites temporales, restaurante, cursor y paginación.
// Son pruebas unitarias de consultas; no reemplazan RLS ni integración real.
function base(tablas: Record<string, Fila[]>, falla?: string) {
  const lecturas: Lectura[] = [];
  class Consulta {
    private filas: Fila[];
    private filtros: Lectura["filtros"] = [];
    private limite: number | null = null;
    private rango: [number, number] | undefined;
    constructor(private tabla: string) { this.filas = [...(tablas[tabla] ?? [])]; }
    select() { return this; }
    order() { return this; }
    overrideTypes() { return this; }
    private filtrar(op: string, col: string, valor: unknown, cumple: (v: unknown) => boolean) {
      this.filtros.push([op, col, valor]);
      this.filas = this.filas.filter(f => cumple(f[col]));
      return this;
    }
    eq(col: string, v: unknown) { return this.filtrar("eq", col, v, n => n === v); }
    neq(col: string, v: unknown) { return this.filtrar("neq", col, v, n => n !== v); }
    is(col: string, v: unknown) { return this.eq(col, v); }
    in(col: string, v: unknown[]) { return this.filtrar("in", col, v, n => v.includes(n)); }
    gte(col: string, v: string) { return this.filtrar("gte", col, v, n => String(n) >= v); }
    lt(col: string, v: string) { return this.filtrar("lt", col, v, n => String(n) < v); }
    gt(col: string, v: string) { return this.filtrar("gt", col, v, n => String(n) > v); }
    range(a: number, b: number) { this.rango = [a, b]; return this; }
    limit(n: number) { this.limite = n; return this; }
    then<T>(resolver: (r: { data: Fila[] | null; count: number; error: unknown }) => T) {
      const orden = this.filas.toSorted((a, b) => String(a.id).localeCompare(String(b.id)));
      let pagina = this.rango ? orden.slice(this.rango[0], this.rango[1] + 1) : orden;
      if (this.limite !== null) pagina = pagina.slice(0, this.limite);
      lecturas.push({ tabla: this.tabla, filtros: this.filtros, limite: this.limite });
      return Promise.resolve({ data: this.tabla === falla ? null : pagina, count: orden.length,
        error: this.tabla === falla ? new Error("Fallo simulado") : null }).then(resolver);
    }
  }
  vi.mocked(crearClienteServidor).mockResolvedValue({ from: (tabla: string) => new Consulta(tabla) } as never);
  return lecturas;
}

beforeEach(() => vi.clearAllMocks());

describe("US-112: comparación consultada hasta la misma hora", () => {
  it("excluye lo posterior al corte y usa confirmed_at para ventas, created_at para pedidos", async () => {
    const lecturas = base({
      orders: [pedido("h"), pedido("a", "2026-11-25"),
        pedido("despues", "2026-11-25", { created_at: dia("2026-11-25", "20:31:00") }),
        pedido("en-corte", "2026-11-25", { created_at: dia("2026-11-25", "20:30:00") }),
        pedido("otra", "2026-11-25", { restaurant_id: "r2" })],
      payments: [pago("ph", "h", "2026-11-26", { amount: 20 }), pago("pa", "a"),
        pago("pa-ayer", "a", "2026-11-25"),
        pago("tarde", "despues", "2026-11-25", { amount: 100, confirmed_at: dia("2026-11-25", "20:31:00") }),
        pago("exacto", "en-corte", "2026-11-25", { confirmed_at: dia("2026-11-25", "20:30:00") }),
        pago("ajeno", "otra", "2026-11-25", { restaurant_id: "r2" })],
    });
    const panel = await obtenerPanelVivo(restaurante, ahora);
    expect(panel.ventas).toEqual({ hoy: 3000, ayer: 1000, variacionPct: 200 });
    expect(panel.pedidos).toEqual({ hoy: 1, ayer: 1, variacionPct: 0 });
    expect(panel.ticket.hoy).toBe(1500);
    expect(panel.horaCorte).toBe("15:30");
    for (const fecha of ["2026-11-25", "2026-11-26"]) {
      expect(lecturas).toContainEqual(expect.objectContaining({ tabla: "payments", limite: 500,
        filtros: expect.arrayContaining([["eq", "restaurant_id", restaurante], ["gte", "confirmed_at", dia(fecha, "05:00:00")], ["lt", "confirmed_at", dia(fecha, "20:30:00")]]) }));
    }
  });

  it("excluye cancelados y pruebas, también en pagos de sesiones; conserva la cuenta mixta real", async () => {
    base({
      orders: [pedido("real"), pedido("cancelado", undefined, { status: "CANCELLED" }), pedido("prueba"),
        pedido("mc", undefined, { status: "CANCELLED", table_session_id: "mixta" }),
        pedido("mr", undefined, { table_session_id: "mixta" }),
        pedido("sc", undefined, { status: "CANCELLED", table_session_id: "solo-cancelados" })],
      payments: [pago("p1", "real"), pago("p2", "cancelado"), pago("p3", "prueba"),
        pago("p4", null, undefined, { table_session_id: "mixta", amount: 25 }),
        pago("p5", null, undefined, { table_session_id: "solo-cancelados" }),
        pago("p6", "real", undefined, { status: "PENDING", amount: 99 })],
    });
    const panel = await obtenerPanelVivo(restaurante, ahora);
    expect(panel.ventas.hoy).toBe(3500);
    expect(panel.pedidos.hoy).toBe(2);
    expect(panel.ticket.hoy).toBe(1750);
    expect(panel.ventas.ayer).toBe(0);
    expect(panel.ventas.variacionPct).toBeNull();
    expect(vi.mocked(obtenerIdsPedidosDePrueba)).toHaveBeenCalledTimes(1);
  });

  it("ayer sin ventas al corte no usa las ventas posteriores para calcular un porcentaje", async () => {
    base({ orders: [pedido("h"), pedido("a", "2026-11-25")], payments: [pago("h", "h"),
      pago("a", "a", "2026-11-25", { confirmed_at: dia("2026-11-25", "23:00:00") })] });
    expect((await obtenerPanelVivo(restaurante, ahora)).ventas).toEqual({ hoy: 1000, ayer: 0, variacionPct: null });
  });

  it("mantiene el cursor por ID y cuenta más de 500 pedidos y pagos", async () => {
    const orders = Array.from({ length: 501 }, (_, i) => pedido(`o${String(i).padStart(4, "0")}`));
    const payments = orders.map((p, i) => pago(`p${String(i).padStart(4, "0")}`, String(p.id)));
    const lecturas = base({ orders, payments });
    const panel = await obtenerPanelVivo(restaurante, ahora);
    expect(panel.pedidos.hoy).toBe(501);
    expect(panel.ventas.hoy).toBe(501000);
    expect(lecturas.some(l => l.tabla === "payments" && l.filtros.some(([op, col]) => op === "gt" && col === "id"))).toBe(true);
    expect(lecturas.some(l => l.tabla === "orders" && l.filtros.some(([op, col]) => op === "gt" && col === "id"))).toBe(true);
  });

  it("el cambio de día de Lima produce intervalos vacíos a medianoche", async () => {
    base({ orders: [pedido("h", "2026-11-27", { created_at: dia("2026-11-27", "05:00:00") })],
      payments: [pago("h", "h", "2026-11-27", { confirmed_at: dia("2026-11-27", "05:00:00") })] });
    const panel = await obtenerPanelVivo(restaurante, Date.parse("2026-11-27T05:00:00Z"));
    expect(panel.fecha).toBe("2026-11-27");
    expect(panel.horaCorte).toBe("00:00");
    expect(panel.ventas).toEqual({ hoy: 0, ayer: 0, variacionPct: null });
    expect(panel.pedidos.hoy).toBe(0);
  });

  it("aplica el corte a cocina y satisfacción y excluye opiniones de cancelados y pruebas", async () => {
    const h = (id: string, order_id: string, to_status: string, hora: string) => ({
      id, restaurant_id: restaurante, order_id, event: "STATUS", to_status, created_at: dia("2026-11-25", hora),
    });
    const opinion = (id: string, order_id: string, hora = "20:10:00") => ({
      id, restaurant_id: restaurante, order_id, created_at: dia("2026-11-25", hora), service_stars: 4, waiter_stars: 5,
    });
    base({ orders: [pedido("a", "2026-11-25"), pedido("b", "2026-11-25"), pedido("prueba"), pedido("c", undefined, { status: "CANCELLED" })],
      order_status_history: [h("1", "a", "IN_PROGRESS", "20:00:00"), h("2", "a", "READY", "20:10:00"),
        h("3", "b", "IN_PROGRESS", "20:00:00"), h("4", "b", "READY", "20:40:00")],
      order_ratings: [opinion("1", "a"), opinion("2", "b", "20:30:00"), opinion("3", "c"), opinion("4", "prueba")],
    });
    const panel = await obtenerPanelVivo(restaurante, ahora);
    expect(panel.cocinaMin.ayer).toBe(10);
    expect(panel.satisfaccion.ayer).toBe(4);
    expect(panel.satisfaccion.hoy).toBeNull();
  });

  it("un fallo de consulta no se convierte en cero ventas", async () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      base({}, "payments");
      expect((await obtenerPanelVivo(restaurante, ahora)).ventas).toEqual({ hoy: null, ayer: null, variacionPct: null });
    } finally { silencio.mockRestore(); }
  });
});
