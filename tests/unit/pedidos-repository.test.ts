import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));

import { crearClienteServidor } from "@/lib/supabase/server";
import { listarPedidos } from "../../src/features/pedidos/pedidos";

const fila = {
  id: "pedido-1",
  order_number: 104,
  modality: "DINE_IN" as const,
  status: "PENDING" as const,
  total: "25.00",
  created_at: "2026-10-26T15:30:00.000Z",
  dining_tables: { number: 7 },
  order_items: [{
    id: "linea-1",
    product_name: "Ceviche clásico",
    quantity: 2,
    unit_price: "12.50",
    subtotal: "25.00",
    observation: "Sin ají",
  }],
};

function prepararConsulta(resultado: { data: typeof fila[]; error: { code: string } | null }) {
  const consulta = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockResolvedValue(resultado),
  };
  vi.mocked(crearClienteServidor).mockResolvedValue(consulta as never);
  return consulta;
}

beforeEach(() => vi.resetAllMocks());

describe("lectura segura de pedidos del restaurante", () => {
  it("filtra por restaurante, ordena por fecha y convierte los datos para los paneles", async () => {
    const consulta = prepararConsulta({ data: [fila], error: null });
    await expect(listarPedidos("restaurante-a")).resolves.toEqual([{
      id: "pedido-1",
      numero: 104,
      modalidad: "DINE_IN",
      estado: "PENDING",
      total: 25,
      creadoEn: fila.created_at,
      mesa: 7,
      lineas: [{
        id: "linea-1", producto: "Ceviche clásico", cantidad: 2,
        precioUnitario: 12.5, subtotal: 25, observacion: "Sin ají",
      }],
    }]);
    expect(consulta.from).toHaveBeenCalledExactlyOnceWith("orders");
    expect(consulta.eq).toHaveBeenCalledExactlyOnceWith("restaurant_id", "restaurante-a");
    expect(consulta.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(consulta.order).toHaveBeenNthCalledWith(2, "order_number", { ascending: false });
  });

  it("devuelve una lista vacía si el restaurante no tiene pedidos", async () => {
    prepararConsulta({ data: [], error: null });
    await expect(listarPedidos("restaurante-a")).resolves.toEqual([]);
  });

  it("maneja un fallo de lectura sin exponer los detalles de la consulta", async () => {
    prepararConsulta({ data: [], error: { code: "42501" } });
    await expect(listarPedidos("restaurante-a")).rejects.toThrow("No se pudieron cargar los pedidos.");
  });
});
