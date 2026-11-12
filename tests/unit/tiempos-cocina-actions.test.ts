import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/dashboard/tiempos-cocina", () => ({ obtenerTiemposCocina: vi.fn() }));
vi.mock("../../src/features/dashboard/ventas", () => ({ obtenerResumenVentas: vi.fn() }));
vi.mock("../../src/features/dashboard/tendencias", () => ({ obtenerTendencias: vi.fn() }));
import { requerirRol } from "../../src/features/auth/sesion";
import { obtenerTiemposCocina } from "../../src/features/dashboard/tiempos-cocina";
import { consultarTiemposCocinaAction } from "../../src/features/dashboard/actions";
const dia = "2026-11-12";
const vacio = { total: null, porDia: [], porFranja: [], porPlato: [] };
type Membresia = Awaited<ReturnType<typeof requerirRol>>["membresias"][number];
const membresia = (rol: Membresia["rol"], restaurantId = "propio"): Membresia => ({ rol, restaurantId, branchId: null });
function sesion(membresias: Membresia[]) {
  vi.mocked(requerirRol).mockResolvedValue({ usuario: {} as never, membresias });
}
beforeEach(() => {
  vi.resetAllMocks();
  sesion([membresia("OWNER")]);
  vi.mocked(obtenerTiemposCocina).mockResolvedValue(vacio);
});
describe("acción de tiempos US-081", () => {
  it.each(["OWNER", "ADMIN"] as const)("permite %s y usa su restaurante", async (rol) => {
    sesion([membresia(rol)]);
    expect(await consultarTiemposCocinaAction(dia, dia)).toEqual({ ok: true, resumen: vacio });
    expect(requerirRol).toHaveBeenCalledWith(["OWNER", "ADMIN"]);
    expect(obtenerTiemposCocina).toHaveBeenCalledWith("propio", dia, dia);
  });
  it("prioriza OWNER como el reporte de ventas", async () => {
    sesion([membresia("ADMIN", "otro"), membresia("OWNER")]);
    await consultarTiemposCocinaAction(dia, dia);
    expect(obtenerTiemposCocina).toHaveBeenCalledWith("propio", dia, dia);
  });
  it.each(["WAITER", "KITCHEN", "CASHIER"] as const)("no consulta con membresía %s", async (rol) => {
    sesion([membresia(rol)]);
    expect((await consultarTiemposCocinaAction(dia, dia)).ok).toBe(false);
    expect(obtenerTiemposCocina).not.toHaveBeenCalled();
  });
  it("conserva la redirección de acceso sin consultar", async () => {
    const error = new Error("NEXT_REDIRECT");
    vi.mocked(requerirRol).mockRejectedValue(error);
    await expect(consultarTiemposCocinaAction(dia, dia)).rejects.toBe(error);
    expect(obtenerTiemposCocina).not.toHaveBeenCalled();
  });
  it("rechaza fechas antes de consultar", async () => {
    expect((await consultarTiemposCocinaAction("", dia)).ok).toBe(false);
    expect(obtenerTiemposCocina).not.toHaveBeenCalled();
  });
  it("oculta detalles internos de errores", async () => {
    vi.mocked(obtenerTiemposCocina).mockRejectedValue(new Error("detalle privado"));
    expect(await consultarTiemposCocinaAction(dia, dia)).toEqual({
      ok: false, mensaje: "No se pudieron consultar los tiempos de cocina. Intenta de nuevo.",
    });
  });
});
