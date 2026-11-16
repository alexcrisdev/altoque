import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("../../src/features/pedidos/validar-pedido", () => ({ validarPedido: vi.fn() }));
vi.mock("../../src/features/pedidos/registro", () => ({ buscarPedidoIdempotente: vi.fn(), guardarPedidoQr: vi.fn() }));
vi.mock("../../src/features/pedidos/para-llevar", () => ({ obtenerConfigParaLlevar: vi.fn() }));

import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarPedidoIdempotente, guardarPedidoQr } from "../../src/features/pedidos/registro";
import { validarPedido } from "../../src/features/pedidos/validar-pedido";
import { obtenerConfigParaLlevar } from "../../src/features/pedidos/para-llevar";
import { registrarPedidoQrAction as registrarReal } from "../../src/features/pedidos/actions";


const sinAlergia = { respuesta: "NONE", alergenos: [], detalle: "", aceptada: false };
const registrarPedidoQrAction = (token: string, clave: string, entrada: unknown, opciones?: unknown) => registrarReal(token, clave, entrada, opciones, sinAlergia);

const acceso = {
  estado: "VALIDO" as const, qrId: "qr", modalidad: "TAKEAWAY" as const,
  restauranteId: "restaurante", restauranteNombre: "Demo", localId: "local",
  localNombre: "Centro", mesa: null,
};
const clave = "4d87610c-8e36-4e18-a588-4c6bf9be42cd";
const lineas = [{ productoId: "producto", nombre: "Ceviche", cantidad: 2, observacion: null, precioUnitarioCentimos: 3290, subtotalCentimos: 6580 }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(obtenerConfigParaLlevar).mockResolvedValue({ pideNombre: false, pideTelefono: false });
});

describe("registro de pedidos desde QR", () => {
  it("US-091: rechaza respuesta ausente antes de guardar o devolver un reintento", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    expect(await registrarReal("token-qr-largo", clave, [], undefined)).toMatchObject({ ok: false });
    // La base acepta respuesta null por compatibilidad; la obligación vive aquí.
    expect(await registrarReal("token-qr-largo", clave, [], undefined,
      { respuesta: null, alergenos: [], detalle: "", aceptada: false })).toMatchObject({ ok: false });
    expect(buscarPedidoIdempotente).not.toHaveBeenCalled();
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });
  it("US-091: valida aceptación y lleva la alergia junto con las líneas", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue(null);
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6580 });
    vi.mocked(guardarPedidoQr).mockResolvedValue({ id: "pedido", numero: 42, repetido: false });
    const alergia = { respuesta: "YES", alergenos: ["PESCADO"], detalle: "Sin contacto", aceptada: false };
    expect((await registrarReal("token-qr-largo", clave, [], undefined, alergia)).ok).toBe(false);
    expect(guardarPedidoQr).not.toHaveBeenCalled();
    expect((await registrarReal("token-qr-largo", clave, [], undefined, { ...alergia, aceptada: true })).ok).toBe(true);
    expect(guardarPedidoQr).toHaveBeenCalledWith("qr", "restaurante", clave, lineas, expect.anything(), {
      respuesta: "YES", alergenos: ["PESCADO"], detalle: "Sin contacto",
    });
  });
  it("registra con el QR y restaurante resueltos en servidor y devuelve el número", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue(null);
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6580 });
    vi.mocked(guardarPedidoQr).mockResolvedValue({ id: "pedido", numero: 42, repetido: false });

    const entrada = [{ productoId: "producto", cantidad: 2, observacion: null, precioMostradoCentimos: 3290 }];
    await expect(registrarPedidoQrAction("token-qr-largo", clave, entrada)).resolves.toEqual({ ok: true, numero: 42 });
    expect(validarPedido).toHaveBeenCalledWith("restaurante", entrada);
    expect(guardarPedidoQr).toHaveBeenCalledWith("qr", "restaurante", clave, lineas, { modalidad: "TAKEAWAY", nombre: null, telefono: null }, { respuesta: "NONE", alergenos: [], detalle: null });
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

  it("explica con claridad cuando el QR ya tiene dos pedidos sin pagar", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue(null);
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6580 });
    vi.mocked(guardarPedidoQr).mockRejectedValue(new Error("Tienes 2 pedidos sin pagar. Págalos o espera a que venzan para pedir otro."));

    await expect(registrarPedidoQrAction("token-qr-largo", clave, []))
      .resolves.toEqual({ ok: false, mensaje: "Tienes 2 pedidos sin pagar. Págalos o espera a que venzan para pedir otro." });
  });

  it("US-002: desde una mesa el cliente puede pedir para llevar con sus datos", async () => {
    const mesa = { ...acceso, modalidad: "DINE_IN" as const, mesa: { id: "mesa", numero: 3 } };
    vi.mocked(resolverAccesoQr).mockResolvedValue(mesa);
    vi.mocked(obtenerConfigParaLlevar).mockResolvedValue({ pideNombre: true, pideTelefono: true });
    vi.mocked(buscarPedidoIdempotente).mockResolvedValue(null);
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6580 });
    vi.mocked(guardarPedidoQr).mockResolvedValue({ id: "pedido", numero: 43, repetido: false });

    await expect(registrarPedidoQrAction("token-qr-largo", clave, [{}], { modalidad: "TAKEAWAY", nombre: " Ana ", telefono: "987 654-321" }))
      .resolves.toEqual({ ok: true, numero: 43 });
    expect(guardarPedidoQr).toHaveBeenCalledWith("qr", "restaurante", clave, lineas, { modalidad: "TAKEAWAY", nombre: "Ana", telefono: "987654321" }, { respuesta: "NONE", alergenos: [], detalle: null });
  });

  it("US-002: no registra para llevar sin los datos que pide el restaurante", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    vi.mocked(obtenerConfigParaLlevar).mockResolvedValue({ pideNombre: true, pideTelefono: false });
    await expect(registrarPedidoQrAction("token-qr-largo", clave, [{}], { modalidad: "TAKEAWAY", nombre: "" }))
      .resolves.toMatchObject({ ok: false, mensaje: expect.stringContaining("nombre") });
    expect(validarPedido).not.toHaveBeenCalled();
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });

  it("US-002: un QR de mostrador no permite pedir como si fuera una mesa", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
    await expect(registrarPedidoQrAction("token-qr-largo", clave, [{}], { modalidad: "DINE_IN" }))
      .resolves.toMatchObject({ ok: false });
    expect(guardarPedidoQr).not.toHaveBeenCalled();
  });
});
