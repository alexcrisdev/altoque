import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { listarPedidosCocina } from "../../src/features/cocina/pedidos-cocina";

beforeEach(() => vi.resetAllMocks());
describe("US-080: consulta del día y alérgenos", () => {
  it("filtra restaurante, rango de Lima y estados; conserva alérgenos y observaciones", async () => {
    const cliente = {
      from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ error: null, data: [{
        id: "pedido", order_number: 3, created_at: "2026-11-11T16:00:00Z", status: "IN_PROGRESS", modality: "DINE_IN", source: "QR",
        customer_name: null, dining_tables: { number: 3 }, order_incidents: [],
        order_items: [{ product_name: "Ceviche", quantity: 2, observation: "Sin ají", products: { allergens: ["Pescado"] } }],
      }] }),
    };
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
    const pedidos = await listarPedidosCocina("restaurante", Date.parse("2026-11-11T16:00:00Z"));
    expect(cliente.eq).toHaveBeenCalledWith("restaurant_id", "restaurante");
    expect(cliente.gte).toHaveBeenCalledWith("created_at", "2026-11-11T05:00:00.000Z");
    expect(cliente.lt).toHaveBeenCalledWith("created_at", "2026-11-12T05:00:00.000Z");
    expect(cliente.in).toHaveBeenCalledWith("status", ["IN_PROGRESS", "READY", "CANCELLED"]);
    expect(cliente.select.mock.calls[0][0]).toContain("products(allergens)");
    expect(pedidos[0].items).toEqual([{ nombre: "Ceviche", cantidad: 2, observacion: "Sin ají", alergenos: ["Pescado"] }]);
  });
});

describe("US-085: pedidos pendientes fuera de cocina", () => {
  it.each([undefined, Date.parse("2026-11-11T16:00:00Z")])(
    "excluye PENDING al consultar cocina con día %s", async (dia) => {
      const base = {
        order_number: 85, created_at: "2026-11-11T16:00:00Z", modality: "TAKEAWAY", source: "QR",
        customer_name: "Prueba", dining_tables: null, order_incidents: [], order_items: [],
      };
      const filas = [
        { ...base, id: "espera-pago", status: "PENDING" },
        { ...base, id: "pagado", status: "IN_PROGRESS" },
      ];
      let estados: string[] = [];
      const cliente = {
        from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        in: vi.fn((_columna: string, valores: string[]) => { estados = valores; return cliente; }),
        gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        overrideTypes: vi.fn(async () => ({ error: null, data: filas.filter(fila => estados.includes(fila.status)) })),
      };
      vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
      const pedidos = await listarPedidosCocina("restaurante", dia);
      expect(estados).not.toContain("PENDING");
      expect(pedidos.map(pedido => pedido.id)).toEqual(["pagado"]);
      expect(cliente.eq).toHaveBeenCalledWith("restaurant_id", "restaurante");
    },
  );
});
