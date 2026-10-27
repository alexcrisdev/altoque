import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("@/features/pedidos/validar-pedido", () => ({ validarPedido: vi.fn() }));
vi.mock("../../src/features/mesero/pedido-asistido", () => ({
  buscarPedidoAsistido: vi.fn(),
  guardarPedidoAsistido: vi.fn(),
}));
vi.mock("../../src/features/mesero/sesiones", () => ({ abrirSesion: vi.fn(), cerrarSesion: vi.fn() }));

import { requerirRol } from "@/features/auth/sesion";
import { validarPedido } from "@/features/pedidos/validar-pedido";
import { registrarPedidoAsistidoAction } from "../../src/features/mesero/actions";
import { buscarPedidoAsistido, guardarPedidoAsistido } from "../../src/features/mesero/pedido-asistido";
import {
  mensajeRechazo,
  motivoDeError,
  validarSolicitudAsistida,
} from "../../src/features/mesero/solicitud-asistida";

const MESA = "30000000-0000-0000-0000-000000000001";
const LOCAL = "20000000-0000-0000-0000-000000000001";
const clave = "4d87610c-8e36-4e18-a588-4c6bf9be42cd";
const sesion = {
  usuario: { id: "mesero-1" },
  membresias: [{ restaurantId: "restaurante-1", branchId: null, rol: "WAITER" }],
};
const lineas = [{ productoId: "p", nombre: "Ceviche", cantidad: 2, observacion: null, precioUnitarioCentimos: 3200, subtotalCentimos: 6400 }];

describe("validarSolicitudAsistida", () => {
  it("acepta en el local con mesa y para llevar con local", () => {
    expect(validarSolicitudAsistida({ modalidad: "DINE_IN", mesaId: MESA })).toEqual({ modalidad: "DINE_IN", mesaId: MESA, localId: null });
    expect(validarSolicitudAsistida({ modalidad: "TAKEAWAY", mesaId: null, localId: LOCAL })).toEqual({ modalidad: "TAKEAWAY", mesaId: null, localId: LOCAL });
  });

  it("descarta el local cuando el pedido es en mesa", () => {
    expect(validarSolicitudAsistida({ modalidad: "DINE_IN", mesaId: MESA, localId: LOCAL })).toMatchObject({ localId: null });
  });

  it("rechaza modalidades desconocidas, IDs inválidos y para llevar con mesa", () => {
    expect(validarSolicitudAsistida({ modalidad: "DELIVERY", mesaId: MESA })).toBeNull();
    expect(validarSolicitudAsistida({ modalidad: "DINE_IN", mesaId: "mesa-1" })).toBeNull();
    expect(validarSolicitudAsistida({ modalidad: "TAKEAWAY", mesaId: MESA, localId: LOCAL })).toBeNull();
    expect(validarSolicitudAsistida(null)).toBeNull();
  });
});

describe("motivoDeError", () => {
  it("traduce los errores de la base a motivos", () => {
    expect(motivoDeError("TABLE_SESSION_CLOSED")).toBe("MESA_SIN_SESION");
    expect(motivoDeError("FORBIDDEN")).toBe("SIN_PERMISO");
    expect(motivoDeError("PRODUCT_UNAVAILABLE")).toBe("PRODUCTO_NO_DISPONIBLE");
    expect(motivoDeError("algo raro")).toBe("ERROR");
    expect(motivoDeError(undefined)).toBe("ERROR");
    expect(mensajeRechazo("MESA_SIN_SESION")).toContain("sesión abierta");
  });
});

describe("registrarPedidoAsistidoAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requerirRol).mockResolvedValue(sesion as never);
    vi.mocked(buscarPedidoAsistido).mockResolvedValue(null);
  });

  it("registra con el restaurante de la sesión y devuelve el número", async () => {
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6400 });
    vi.mocked(guardarPedidoAsistido).mockResolvedValue({ ok: true, numero: 77, repetido: false });
    const items = [{ productoId: "p", cantidad: 2, observacion: null, precioMostradoCentimos: 3200 }];

    await expect(registrarPedidoAsistidoAction(clave, { modalidad: "DINE_IN", mesaId: MESA }, items))
      .resolves.toEqual({ ok: true, numero: 77 });
    expect(requerirRol).toHaveBeenCalledWith(["WAITER", "OWNER", "ADMIN"]);
    expect(validarPedido).toHaveBeenCalledWith("restaurante-1", items);
    expect(guardarPedidoAsistido).toHaveBeenCalledWith(
      "restaurante-1", clave, { modalidad: "DINE_IN", mesaId: MESA, localId: null }, lineas,
    );
  });

  it("rechaza una clave inválida o una solicitud sin mesa ni local sin tocar la base", async () => {
    await expect(registrarPedidoAsistidoAction("no-es-uuid", { modalidad: "DINE_IN", mesaId: MESA }, []))
      .resolves.toMatchObject({ ok: false });
    await expect(registrarPedidoAsistidoAction(clave, { modalidad: "DINE_IN" }, []))
      .resolves.toMatchObject({ ok: false });
    expect(validarPedido).not.toHaveBeenCalled();
    expect(guardarPedidoAsistido).not.toHaveBeenCalled();
  });

  it("devuelve el pedido previo ante un reintento con la misma clave", async () => {
    vi.mocked(buscarPedidoAsistido).mockResolvedValue(77);
    await expect(registrarPedidoAsistidoAction(clave, { modalidad: "DINE_IN", mesaId: MESA }, []))
      .resolves.toEqual({ ok: true, numero: 77 });
    expect(buscarPedidoAsistido).toHaveBeenCalledWith("mesero-1", clave);
    expect(validarPedido).not.toHaveBeenCalled();
    expect(guardarPedidoAsistido).not.toHaveBeenCalled();
  });

  it("no guarda si un producto no pasa la validación del servidor", async () => {
    vi.mocked(validarPedido).mockResolvedValue({ ok: false, problemas: [{ productoId: "p", nombre: "Ceviche", motivo: "AGOTADO" }] });
    await expect(registrarPedidoAsistidoAction(clave, { modalidad: "DINE_IN", mesaId: MESA }, [{}]))
      .resolves.toMatchObject({ ok: false, problemas: [{ motivo: "AGOTADO" }] });
    expect(guardarPedidoAsistido).not.toHaveBeenCalled();
  });

  it("explica el rechazo de la base, por ejemplo una mesa sin sesión", async () => {
    vi.mocked(validarPedido).mockResolvedValue({ ok: true, lineas, totalCentimos: 6400 });
    vi.mocked(guardarPedidoAsistido).mockResolvedValue({ ok: false, motivo: "MESA_SIN_SESION" });
    await expect(registrarPedidoAsistidoAction(clave, { modalidad: "DINE_IN", mesaId: MESA }, [{}]))
      .resolves.toEqual({ ok: false, mensaje: mensajeRechazo("MESA_SIN_SESION") });
  });
});
