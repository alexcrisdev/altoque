import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: vi.fn() }));
vi.mock("../../src/features/pedidos/estado-servidor", () => ({ guardarEstadoPedido: vi.fn() }));

import { obtenerSesion } from "../../src/features/auth/sesion";
import { guardarEstadoPedido } from "../../src/features/pedidos/estado-servidor";
import { cambiarEstadoPedido } from "../../src/features/pedidos/estado-actions";
import { mensajeErrorEstado } from "../../src/features/pedidos/estados";
import type { Rol } from "../../src/features/auth/permisos";

const pedidoId = "69000000-0000-0000-0000-000000000001";
function sesion(rol: Rol) {
  vi.mocked(obtenerSesion).mockResolvedValue({
    usuario: { id: "personal" }, membresias: [{ restaurantId: "restaurante", branchId: null, rol }],
  } as NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(guardarEstadoPedido).mockResolvedValue({ data: "IN_PROGRESS", error: null } as Awaited<ReturnType<typeof guardarEstadoPedido>>);
});

describe("acciones de estado US-069", () => {
  it("cocina puede solicitar deshacer; la RPC valida el plazo", async () => {
    sesion("KITCHEN");
    expect(await cambiarEstadoPedido(pedidoId, "IN_PROGRESS")).toEqual({ ok: true });
    expect(guardarEstadoPedido).toHaveBeenCalledWith(pedidoId, "IN_PROGRESS", undefined);
  });
  it("presenta el rechazo del servidor cuando venció el plazo", async () => {
    sesion("KITCHEN");
    vi.mocked(guardarEstadoPedido).mockResolvedValue({ data: null, error: { message: "UNDO_EXPIRED" } } as Awaited<ReturnType<typeof guardarEstadoPedido>>);
    expect(await cambiarEstadoPedido(pedidoId, "IN_PROGRESS")).toEqual({ ok: false, mensaje: mensajeErrorEstado("UNDO_EXPIRED") });
  });
  it("mesero puede solicitar cancelación con motivo", async () => {
    sesion("WAITER");
    expect(await cambiarEstadoPedido(pedidoId, "CANCELLED", "Cliente se retiró")).toEqual({ ok: true });
    expect(guardarEstadoPedido).toHaveBeenCalledWith(pedidoId, "CANCELLED", "Cliente se retiró");
  });
  it.each(["READY", "IN_PROGRESS", "ACCEPTED"] as const)("mesero no puede solicitar %s", async (estado) => {
    sesion("WAITER");
    expect(await cambiarEstadoPedido(pedidoId, estado)).toEqual({ ok: false, mensaje: mensajeErrorEstado("FORBIDDEN") });
    expect(guardarEstadoPedido).not.toHaveBeenCalled();
  });
  it("no escribe sin sesión", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue(null);
    expect(await cambiarEstadoPedido(pedidoId, "READY")).toEqual({ ok: false, mensaje: mensajeErrorEstado("FORBIDDEN") });
    expect(guardarEstadoPedido).not.toHaveBeenCalled();
  });
});
