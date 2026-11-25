import { beforeEach, describe, expect, it, vi } from "vitest";

// US-145 (ajuste de US-111): panel en vivo, mapa de calor y tiempos de cocina no cuentan
// pedidos de prueba. Base falsa: cada tabla devuelve sus filas y los filtros eq/neq/in/gt
// se aplican de verdad sobre ellas, con paginación por range o limit.

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock(import("../../src/features/dashboard/pedidos-de-prueba"), async (original) => ({
  ...await original(),
  obtenerIdsPedidosDePrueba: vi.fn(async () => new Set(["prueba-1", "prueba-2"])),
}));
vi.mock("../../src/features/dashboard/tendencias", () => ({ obtenerTendencias: vi.fn(async () => ({ productos: [] })) }));
vi.mock("../../src/features/dashboard/satisfaccion", () => ({ obtenerSatisfaccionDia: vi.fn(async () => ({ servicio: null })) }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerPanelVivo } from "../../src/features/dashboard/panel-vivo";
import { obtenerMapaCalor } from "../../src/features/dashboard/mapa-calor";
import { obtenerTiemposCocina } from "../../src/features/dashboard/tiempos-cocina";

type Filas = Record<string, Record<string, unknown>[]>;

function baseFalsa(tablas: Filas) {
  class Consulta {
    private filas: Record<string, unknown>[];
    private rango: [number, number] | null = null;
    private limite: number | null = null;
    constructor(tabla: string) { this.filas = [...(tablas[tabla] ?? [])]; }
    private filtrar(cumple: (f: Record<string, unknown>) => boolean) { this.filas = this.filas.filter(cumple); return this; }
    select() { return this; }
    gte() { return this; }
    lt() { return this; }
    is() { return this; }
    order() { return this; }
    overrideTypes() { return this; }
    eq(col: string, valor: unknown) { return this.filtrar((f) => !(col in f) || f[col] === valor); }
    neq(col: string, valor: unknown) { return this.filtrar((f) => !(col in f) || f[col] !== valor); }
    in(col: string, valores: unknown[]) { return this.filtrar((f) => !(col in f) || valores.includes(f[col])); }
    gt(col: string, valor: string) { return this.filtrar((f) => String(f[col]) > valor); }
    range(desde: number, hasta: number) { this.rango = [desde, hasta]; return this; }
    limit(n: number) { this.limite = n; return this; }
    then<T>(resolver: (r: { data: unknown[]; count: number; error: null }) => T) {
      const ordenadas = [...this.filas].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
      let pagina = this.rango ? ordenadas.slice(this.rango[0], this.rango[1] + 1) : ordenadas;
      if (this.limite !== null) pagina = pagina.slice(0, this.limite);
      return Promise.resolve({ data: pagina, count: ordenadas.length, error: null }).then(resolver);
    }
  }
  const cliente = { from: vi.fn((tabla: string) => new Consulta(tabla)) };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
  return cliente;
}

beforeEach(() => vi.mocked(crearClienteServidor).mockReset());

describe("US-145: panel en vivo sin pedidos de prueba", () => {
  it("no cuenta pedidos, pagos ni esperas de pago de prueba", async () => {
    const ahora = Date.parse("2026-11-25T17:00:00Z");
    baseFalsa({
      orders: [
        { id: "real-1", status: "DELIVERED", table_session_id: null },
        { id: "real-2", status: "PENDING", table_session_id: null },
        { id: "prueba-1", status: "DELIVERED", table_session_id: null },
        { id: "prueba-2", status: "PENDING", table_session_id: null },
        { id: "cancelado", status: "CANCELLED", table_session_id: null },
      ],
      payments: [
        { id: "pago-real", order_id: "real-1", table_session_id: null, method: "CASH", status: "CONFIRMED", amount: "20.00", confirmed_at: "2026-11-25T16:00:00Z" },
        { id: "pago-prueba", order_id: "prueba-1", table_session_id: null, method: "CASH", status: "CONFIRMED", amount: "50.00", confirmed_at: "2026-11-25T16:00:00Z" },
      ],
    });
    const panel = await obtenerPanelVivo("r1", ahora);
    expect(panel.pedidos.hoy).toBe(2); // real-1 y real-2
    expect(panel.ventas.hoy).toBe(2000); // solo los S/ 20 reales
    expect(panel.esperandoPago).toBe(1); // real-2
  });
});

describe("US-145: mapa de calor sin pedidos de prueba", () => {
  it("excluye del total y de los platos los pedidos de prueba", async () => {
    const pedido = (id: string) => ({
      id, status: "DELIVERED", created_at: "2026-11-02T16:30:00Z",
      order_items: [{ product_id: id === "real-1" ? "ceviche" : "chicha", product_name: id === "real-1" ? "Ceviche" : "Chicha" }],
    });
    baseFalsa({ orders: [pedido("real-1"), pedido("prueba-1")] });
    const resultado = await obtenerMapaCalor("r1", {
      desde: "2026-11-02", hasta: "2026-11-02", horaDesde: 0, horaHasta: 23, diasAbiertos: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(resultado.totalPedidos).toBe(1);
    expect(resultado.productos.map((p) => p.nombre)).toEqual(["Ceviche"]);
  });
});

describe("US-145: tiempos de cocina sin pedidos de prueba", () => {
  const historial = (pedido: string, n: number) => [
    { id: `h${n}a`, order_id: pedido, event: "STATUS", from_status: "PENDING", to_status: "IN_PROGRESS", created_at: "2026-11-13T04:30:00Z", reason: null },
    { id: `h${n}b`, order_id: pedido, event: "STATUS", from_status: "IN_PROGRESS", to_status: "READY", created_at: "2026-11-13T05:30:00Z", reason: null },
  ];
  it("solo promedia los pedidos reales", async () => {
    baseFalsa({
      order_status_history: [...historial("real-1", 1), ...historial("prueba-1", 2)],
      orders: [
        { id: "real-1", status: "READY", order_items: [{ product_name: "Ceviche" }] },
        { id: "prueba-1", status: "READY", order_items: [{ product_name: "Ceviche" }] },
      ],
    });
    const conPrueba = await obtenerTiemposCocina("r1", "2026-11-12", "2026-11-12");
    expect(conPrueba.total?.pedidos).toBe(1);
  });
});
