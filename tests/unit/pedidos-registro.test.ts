import { beforeEach, describe, expect, it, vi } from "vitest";

const { crearClienteAdmin, rpc, single } = vi.hoisted(() => ({
  crearClienteAdmin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin }));

import {
  guardarPedidoQr,
  MENSAJE_LIMITE_PEDIDOS_QR,
} from "../../src/features/pedidos/registro";

beforeEach(() => {
  vi.resetAllMocks();
  crearClienteAdmin.mockReturnValue({ rpc });
  rpc.mockReturnValue({ single });
});

describe("guardarPedidoQr", () => {
  it("traduce la omisión del INSERT por el límite a un rechazo de pedido", async () => {
    single.mockResolvedValue({
      data: { pedido_id: null, numero_pedido: null, repetido: true },
      error: null,
    });

    await expect(guardarPedidoQr(
      "qr", "restaurante", "clave", [] as never, {} as never,
      { respuesta: "NONE", alergenos: [], detalle: null },
    )).rejects.toThrow(MENSAJE_LIMITE_PEDIDOS_QR);
  });
});
