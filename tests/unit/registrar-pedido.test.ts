import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("../../src/features/pedidos/validar-pedido", () => ({ validarPedido: vi.fn() }));
vi.mock("../../src/features/pedidos/registro", () => ({ buscarPedidoIdempotente: vi.fn(), guardarPedidoQr: vi.fn() }));

import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarPedidoIdempotente, guardarPedidoQr } from "../../src/features/pedidos/registro";
import { validarPedido } from "../../src/features/pedidos/validar-pedido";
import { registrarPedidoQrAction } from "../../src/features/pedidos/actions";

const acceso = {
  estado: "VALIDO" as const, qrId: "qr", modalidad: "TAKEAWAY" as const,
  restauranteId: "restaurante", restauranteNombre: "Demo", localId: "local",
  localNombre: "Centro", mesa: null,
};
const clave = "4d87610c-8e36-4e18-a588-4c6bf9be42cd";
const lineas = [{ productoId: "producto", nombre: "Ceviche", cantidad: 2, observacion: null, precioUnitarioCentimos: 3290, subtotalCentimos: 6580 }];

beforeEach(() => vi.resetAllMocks());

describe("registro de pedidos desde QR", () => {
  it("registra con el QR y restaurante resueltos en servidor y devuelve el número", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue(null);
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6580 });
    vi.mocked(guardarPedidoQr).mockResolvedValue({ id: "pedido", numero: 42, repetido: false });

    const entrada = [{ productoId: "producto", cantidad: 2, observacion: null, precioMostradoCentimos: 3290 }];
    await expect(registrarPedidoQrAction("token-qr-largo", clave, entrada)).resolves.toEqual({ ok: true, numero: 42 });
    expect(validarPedido).toHaveBeenCalledWith("restaurante", entrada);
    expect(guardarPedidoQr).toHaveBeenCalledWith("qr", clave, lineas);
  });

  it("rechaza una clave inválida sin consultar el QR", async () => {
    await expect(registrarPedidoQrAction("token-qr-largo", "no-es-uuid", [])).resolves.toMatchObject({ ok: false });
    expect(resolverAccesoQr).not.toHaveBeenCalled();
  });

  it("rechaza un QR inválido antes de validar o guardar productos", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue({ estado: "INVALIDO" });
    await expect(registrarPedidoQrAction("token-qr-largo", clave, [])).resolves.toMatchObject({ ok: false });
    expect(validarPedido).not.toHaveBeenCalled();
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });

  it("no guarda cuando hay productos o precios que no pasan la validación del servidor", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(validarPedido).mockResolvedValue({ ok: false, problemas: [{ productoId: "producto", nombre: "Ceviche", motivo: "AGOTADO" }] });
    await expect(registrarPedidoQrAction("token-qr-largo", clave, [{}])).resolves.toMatchObject({ ok: false, problemas: [{ motivo: "AGOTADO" }] });
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });

  it("devuelve el pedido previo ante un reintento aunque el producto ya haya cambiado", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue({ id: "pedido", numero: 42, repetido: true });
    await expect(registrarPedidoQrAction("token-qr-largo", clave, [])).resolves.toEqual({ ok: true, numero: 42 });
    expect(validarPedido).not.toHaveBeenCalled();
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });
});
