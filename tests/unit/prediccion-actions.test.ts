import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/dashboard/prediccion", () => ({ obtenerPrediccionManana: vi.fn() }));
import { requerirRol } from "../../src/features/auth/sesion";
import { obtenerPrediccionManana, type ResumenPrediccion } from "../../src/features/dashboard/prediccion";
import { consultarPrediccionMananaAction } from "../../src/features/dashboard/prediccion-actions";
import type { Rol } from "../../src/features/auth/permisos";

const resumen: ResumenPrediccion = { fecha: "2026-11-15", dia: "domingo", modelo: null, esDemo: false, platos: [] };
function sesion(membresias: { rol: Rol; restaurantId: string; branchId: null }[]) {
  vi.mocked(requerirRol).mockResolvedValue({ usuario: { id: "usuario" }, membresias } as Awaited<ReturnType<typeof requerirRol>>);
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(obtenerPrediccionManana).mockResolvedValue(resumen); });

describe("US-090: acción autorizada de predicción", () => {
  it.each(["OWNER", "ADMIN"] as const)("permite consultar al rol %s con su restaurante", async rol => {
    sesion([{ rol, restaurantId: "restaurante-autorizado", branchId: null }]);
    expect(await consultarPrediccionMananaAction()).toEqual({ ok: true, resumen });
    expect(requerirRol).toHaveBeenCalledExactlyOnceWith(["OWNER", "ADMIN"]);
    expect(obtenerPrediccionManana).toHaveBeenCalledExactlyOnceWith("restaurante-autorizado");
  });

  it("prioriza OWNER aunque ADMIN aparezca primero en las membresías", async () => {
    sesion([{ rol: "ADMIN", restaurantId: "otro", branchId: null },
      { rol: "OWNER", restaurantId: "restaurante-dueno", branchId: null }]);
    await consultarPrediccionMananaAction();
    expect(obtenerPrediccionManana).toHaveBeenCalledExactlyOnceWith("restaurante-dueno");
  });

  it.each(["WAITER", "KITCHEN", "CASHIER"] as const)("no consulta con una membresía %s", async rol => {
    sesion([{ rol, restaurantId: "restaurante", branchId: null }]);
    expect(await consultarPrediccionMananaAction()).toMatchObject({ ok: false });
    expect(obtenerPrediccionManana).not.toHaveBeenCalled();
  });

  it("no consulta sin membresías", async () => {
    sesion([]);
    expect(await consultarPrediccionMananaAction()).toMatchObject({ ok: false });
    expect(obtenerPrediccionManana).not.toHaveBeenCalled();
  });

  it("conserva las redirecciones de autenticación", async () => {
    const redireccion = new Error("NEXT_REDIRECT");
    vi.mocked(requerirRol).mockRejectedValue(redireccion);
    await expect(consultarPrediccionMananaAction()).rejects.toBe(redireccion);
    expect(obtenerPrediccionManana).not.toHaveBeenCalled();
  });

  it("un fallo de datos devuelve un error sin información interna", async () => {
    sesion([{ rol: "ADMIN", restaurantId: "restaurante", branchId: null }]);
    vi.mocked(obtenerPrediccionManana).mockRejectedValue(new Error("Error interno privado"));
    expect(await consultarPrediccionMananaAction()).toEqual({
      ok: false, mensaje: "No se pudo consultar la predicción para mañana. Intenta de nuevo.",
    });
  });
});
