import { afterEach, describe, expect, it, vi } from "vitest";

// US-036: el cliente arma su carrito con la mesa sin habilitar y confirma cuando el mesero la
// habilita, sin recargar. Sin base: el acceso por QR y la sesión de mesa son simulados.
vi.mock("server-only", () => ({}));
const { resolverAccesoQr, buscarSesionAbierta } = vi.hoisted(() => ({ resolverAccesoQr: vi.fn(), buscarSesionAbierta: vi.fn() }));
vi.mock("../../src/features/acceso-qr/acceso", () => ({ resolverAccesoQr }));
vi.mock("../../src/features/mesero/sesiones", () => ({ buscarSesionAbierta }));

import { consultarMesaHabilitadaAction } from "../../src/features/acceso-qr/mesa-habilitada-actions";
import {
  claveCarrito, leerCarritoGuardado, serializarCarrito, VIGENCIA_CARRITO_MS,
} from "../../src/features/pedidos/carrito-sesion";

const AHORA = Date.parse("2026-11-28T15:00:00Z");
const ITEMS = [
  { productoId: "ceviche", cantidad: 2, observacion: "sin ají" },
  { productoId: "chicha", cantidad: 1, observacion: null },
];
const mesa = (numero = 4) => ({
  estado: "VALIDO", modalidad: "DINE_IN", restauranteId: "r1", restauranteNombre: "R", localNombre: "L",
  mesa: { id: "mesa-4", numero },
});

afterEach(() => { vi.resetAllMocks(); });

describe("consultarMesaHabilitadaAction", () => {
  it("con sesión abierta responde habilitada (y nada más)", async () => {
    resolverAccesoQr.mockResolvedValue(mesa());
    buscarSesionAbierta.mockResolvedValue({ id: "sesion-1", opened_at: "2026-11-28T14:59:00Z" });
    const r = await consultarMesaHabilitadaAction("token-qr");
    expect(r).toEqual({ habilitada: true });
    expect(buscarSesionAbierta).toHaveBeenCalledWith("mesa-4"); // la mesa sale del token
  });

  it("sin sesión abierta: no habilitada", async () => {
    resolverAccesoQr.mockResolvedValue(mesa());
    buscarSesionAbierta.mockResolvedValue(null);
    expect(await consultarMesaHabilitadaAction("token-qr")).toEqual({ habilitada: false });
  });

  it("QR inválido, deshabilitado o error de red: no habilitada", async () => {
    resolverAccesoQr.mockResolvedValueOnce({ estado: "INVALIDO" });
    expect(await consultarMesaHabilitadaAction("x")).toEqual({ habilitada: false });
    resolverAccesoQr.mockResolvedValueOnce({ estado: "DESHABILITADO" });
    expect(await consultarMesaHabilitadaAction("x")).toEqual({ habilitada: false });
    resolverAccesoQr.mockRejectedValueOnce(new Error("sin red"));
    expect(await consultarMesaHabilitadaAction("x")).toEqual({ habilitada: false });
    expect(buscarSesionAbierta).not.toHaveBeenCalled();
  });

  it("para llevar siempre está habilitado", async () => {
    resolverAccesoQr.mockResolvedValue({ ...mesa(), modalidad: "TAKEAWAY", mesa: null });
    expect(await consultarMesaHabilitadaAction("token-llevar")).toEqual({ habilitada: true });
  });
});

describe("carrito guardado en la pestaña (sessionStorage)", () => {
  it("una clave por QR", () => {
    expect(claveCarrito("abc")).toBe("altoque:carrito:abc");
    expect(claveCarrito("abc")).not.toBe(claveCarrito("xyz"));
  });

  it("si recarga antes de que habiliten la mesa, recupera lo elegido", () => {
    const texto = serializarCarrito(ITEMS, false, AHORA);
    expect(leerCarritoGuardado(texto, false, AHORA + 60_000)).toEqual(ITEMS);
    expect(leerCarritoGuardado(texto, true, AHORA + 60_000)).toEqual(ITEMS); // ya la habilitaron
  });

  it("carrito vacío (pedido confirmado) no se guarda", () => {
    expect(serializarCarrito([], true, AHORA)).toBeNull();
  });

  it("si se guardó con la mesa habilitada y ahora no lo está, la cuenta se cerró: se descarta", () => {
    expect(leerCarritoGuardado(serializarCarrito(ITEMS, true, AHORA), false, AHORA + 60_000)).toEqual([]);
  });

  it("descarta lo viejo, lo dañado y las líneas inválidas", () => {
    expect(leerCarritoGuardado(serializarCarrito(ITEMS, false, AHORA), false, AHORA + VIGENCIA_CARRITO_MS + 1)).toEqual([]);
    expect(leerCarritoGuardado("{roto", false, AHORA)).toEqual([]);
    expect(leerCarritoGuardado(null, false, AHORA)).toEqual([]);
    const raro = JSON.stringify({ guardadoEn: AHORA, habilitada: false, items: [
      { productoId: "ok", cantidad: 1 }, { productoId: "", cantidad: 1 }, { productoId: "x", cantidad: 0 },
      { productoId: "y", cantidad: 99 }, { productoId: "z", cantidad: 1, observacion: "a".repeat(141) },
    ] });
    expect(leerCarritoGuardado(raro, false, AHORA)).toEqual([{ productoId: "ok", cantidad: 1, observacion: null }]);
  });
});
