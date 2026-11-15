import { beforeEach, expect, it, vi } from "vitest";

const { crearClienteAdmin, rpc, single } = vi.hoisted(() => ({
  crearClienteAdmin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin }));

import { guardarPedidoQr } from "../../src/features/pedidos/registro";

beforeEach(() => {
  vi.resetAllMocks();
  crearClienteAdmin.mockReturnValue({ rpc });
  rpc.mockReturnValue({ single });
});

it("US-091: envía los tres campos junto con productos y clave en un único RPC", async () => {
  single.mockResolvedValue({ data: { pedido_id: "p", numero_pedido: 91, repetido: false }, error: null });
  const resultado = await guardarPedidoQr("qr", "restaurante", "clave", [{ productoId: "plato", nombre: "Plato", cantidad: 1,
    observacion: null, precioUnitarioCentimos: 1000, subtotalCentimos: 1000 }],
  { modalidad: "DINE_IN", nombre: null, telefono: null },
  { respuesta: "YES", alergenos: ["MANI"], detalle: "Evitar contacto" });
  expect(resultado).toEqual({ id: "p", numero: 91, repetido: false });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("registrar_pedido_cliente", {
    p_qr_code_id: "qr", p_idempotency_key: "clave", p_items: [{ productoId: "plato", cantidad: 1, observacion: null }],
    p_modality: "DINE_IN", p_customer_name: null, p_customer_phone: null,
    p_alergia_respuesta: "YES", p_alergenos: ["MANI"], p_alergia_detalle: "Evitar contacto",
  });
});
