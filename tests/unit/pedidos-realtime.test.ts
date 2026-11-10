import { beforeEach, describe, expect, it, vi } from "vitest";

const { crearClienteNavegador } = vi.hoisted(() => ({ crearClienteNavegador: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ crearClienteNavegador }));

import { suscribirPedidosRestaurante } from "../../src/features/mesero/pedidos-realtime";

describe("suscripción Realtime del mesero", () => {
  let handler: ((payload: { new: Record<string, unknown> }) => void) | undefined;
  let suscriptor: ((estado: string) => void) | undefined;
  const canal = {
    on: vi.fn((_tipo: string, filtro: Record<string, unknown>, callback: typeof handler) => {
      expect(filtro).toMatchObject({
        event: "UPDATE", schema: "public", table: "orders", filter: "restaurant_id=eq.restaurante-1",
      });
      handler = callback;
      return canal;
    }),
    subscribe: vi.fn((callback: typeof suscriptor) => { suscriptor = callback; return canal; }),
  };
  const cliente = { channel: vi.fn(() => canal), removeChannel: vi.fn().mockResolvedValue("ok") };

  beforeEach(() => {
    vi.clearAllMocks();
    handler = undefined;
    suscriptor = undefined;
    vi.mocked(crearClienteNavegador).mockReturnValue(cliente as never);
  });

  it("filtra por restaurante, entrega cambios y limpia el canal al desmontar", () => {
    const alCambiar = vi.fn();
    const alEstado = vi.fn();
    const cancelar = suscribirPedidosRestaurante("restaurante-1", () => 7, alCambiar, alEstado);
    expect(cliente.channel).toHaveBeenCalledExactlyOnceWith("mesero-pedidos:restaurante-1");
    suscriptor?.("SUBSCRIBED");
    handler?.({ new: {
      id: "pedido-1", restaurant_id: "restaurante-1", order_number: 42, status: "READY",
      ready_at: "2026-11-10T15:00:00Z", modality: "DINE_IN", dining_table_id: "mesa-7", customer_name: null,
    } });

    expect(alEstado).toHaveBeenCalledExactlyOnceWith("SUBSCRIBED");
    expect(alCambiar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: "pedido-1", numero: 42, estado: "READY", listoEn: "2026-11-10T15:00:00Z", mesaNumero: 7,
    }));
    cancelar();
    expect(cliente.removeChannel).toHaveBeenCalledExactlyOnceWith(canal);
  });

  it("descarta filas de otro restaurante incluso si el callback recibiera una fila ajena", () => {
    const alCambiar = vi.fn();
    suscribirPedidosRestaurante("restaurante-1", () => 1, alCambiar, vi.fn());
    handler?.({ new: {
      id: "pedido-ajeno", restaurant_id: "restaurante-2", order_number: 9, status: "READY",
      ready_at: "2026-11-10T15:00:00Z", modality: "DINE_IN", dining_table_id: "mesa-1", customer_name: null,
    } });
    expect(alCambiar).not.toHaveBeenCalled();
  });
});
