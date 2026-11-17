import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("../../src/features/pedidos/calificaciones", () => ({ guardarCalificacion: vi.fn(), leerEstadoCalificacion: vi.fn() }));

import { resolverAccesoQr } from "../../src/features/acceso-qr/acceso";
import { guardarCalificacion, leerEstadoCalificacion } from "../../src/features/pedidos/calificaciones";
import { calificarPedidoAction, consultarCalificacionAction } from "../../src/features/pedidos/calificacion-actions";
import { resolverDecisionCalificacion } from "../../src/features/pedidos/calificacion-cliente";
import { validarCalificacion } from "../../src/features/pedidos/calificacion-logica";

const clave = "93000000-0000-4000-8000-000000000001";
const datos = { servicio: 5, mesero: 4, comentario: "  Gracias  " };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolverAccesoQr).mockResolvedValue({ estado: "VALIDO", qrId: "qr-validado", restauranteId: "rest-validado" } as never);
  vi.mocked(guardarCalificacion).mockResolvedValue("OK");
});

describe("US-093: acción y decisiones de calificación", () => {
  it("cerrar con X recuerda el cierre sin invocar la acción ni guardar datos", async () => {
    const recordar = vi.fn();
    const accion = vi.fn((entrada) => calificarPedidoAction("token", clave, entrada));
    expect(await resolverDecisionCalificacion({ tipo: "cerrar" }, recordar, accion)).toBeNull();
    expect(recordar).toHaveBeenCalledOnce();
    expect(accion).not.toHaveBeenCalled();
    expect(guardarCalificacion).not.toHaveBeenCalled();
    expect(resolverAccesoQr).not.toHaveBeenCalled();
  });

  it("envía la opinión solo con QR validado y clave del pedido, normalizando comentario", async () => {
    expect(await calificarPedidoAction("token", clave, datos)).toEqual({ ok: true });
    expect(guardarCalificacion).toHaveBeenCalledWith("qr-validado", clave, { servicio: 5, mesero: 4, comentario: "Gracias" });
  });

  it.each([0, 6, 1.5, "5", null])("rechaza estrellas inválidas %s antes de consultar la base", async (servicio) => {
    expect((await calificarPedidoAction("token", clave, { ...datos, servicio })).ok).toBe(false);
    expect(guardarCalificacion).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(201), "hola\n", "hola\t", "hola\u0000", "hola\u0085"])("rechaza comentarios largos o con controles", async (comentario) => {
    expect((await calificarPedidoAction("token", clave, { ...datos, comentario })).ok).toBe(false);
    expect(guardarCalificacion).not.toHaveBeenCalled();
  });

  it("acepta 200 caracteres y convierte comentario vacío en null", () => {
    expect(validarCalificacion({ ...datos, comentario: "a".repeat(200) })).not.toBeNull();
    expect(validarCalificacion({ ...datos, comentario: "   " })?.comentario).toBeNull();
  });

  it("un QR anulado no permite insertar", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue({ estado: "INVALIDO" });
    expect((await calificarPedidoAction("token", clave, datos)).ok).toBe(false);
    expect(guardarCalificacion).not.toHaveBeenCalled();
  });

  it("rechaza una clave manipulada", async () => {
    expect((await calificarPedidoAction("token", "otra-clave", datos)).ok).toBe(false);
    expect(resolverAccesoQr).not.toHaveBeenCalled();
  });

  it("una repetida se informa sin sobrescribir la primera", async () => {
    vi.mocked(guardarCalificacion).mockResolvedValue("REPETIDA");
    expect(await calificarPedidoAction("token", clave, datos)).toMatchObject({ ok: false, repetida: true });
  });

  it("un fallo de base no expone detalles internos", async () => {
    vi.mocked(guardarCalificacion).mockRejectedValue(new Error("detalle privado"));
    const result = await calificarPedidoAction("token", clave, datos);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("detalle privado");
  });

  it("consulta disponibilidad solo después de validar el QR", async () => {
    vi.mocked(leerEstadoCalificacion).mockResolvedValue({ disponible: true, calificada: false });
    expect(await consultarCalificacionAction("token", clave)).toEqual({ disponible: true, calificada: false });
    expect(leerEstadoCalificacion).toHaveBeenCalledWith("qr-validado", clave);
  });
});
