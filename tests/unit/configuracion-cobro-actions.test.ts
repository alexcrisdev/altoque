import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/dashboard/configuracion-restaurante", () => ({
  guardarCobroAnticipado: vi.fn(),
  obtenerCobroAnticipado: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requerirRol } from "../../src/features/auth/sesion";
import { guardarCobroAnticipado, obtenerCobroAnticipado } from "../../src/features/dashboard/configuracion-restaurante";
import { actualizarCobroAnticipadoAction, consultarCobroAnticipadoAction } from "../../src/features/dashboard/configuracion-actions";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requerirRol).mockResolvedValue({
    usuario: { id: "admin" },
    membresias: [{ restaurantId: "restaurante-autorizado", branchId: null, rol: "ADMIN" }],
  } as Awaited<ReturnType<typeof requerirRol>>);
  vi.mocked(obtenerCobroAnticipado).mockResolvedValue(false);
});

describe("US-094: configuración de cobro anticipado", () => {
  it("consulta el restaurante de la membresía luego de validar rol", async () => {
    expect(await consultarCobroAnticipadoAction()).toBe(false);
    expect(requerirRol).toHaveBeenCalledWith(["OWNER", "ADMIN"]);
    expect(obtenerCobroAnticipado).toHaveBeenCalledWith("restaurante-autorizado");
  });

  it("guarda el valor validado para el restaurante autorizado y actualiza /admin", async () => {
    const form = new FormData();
    form.set("activo", "true");
    await actualizarCobroAnticipadoAction(form);
    expect(guardarCobroAnticipado).toHaveBeenCalledWith("restaurante-autorizado", true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("rechaza valores no booleanos antes de guardar", async () => {
    const form = new FormData();
    form.set("activo", "si");
    await expect(actualizarCobroAnticipadoAction(form)).rejects.toThrow("El valor del ajuste no es válido.");
    expect(guardarCobroAnticipado).not.toHaveBeenCalled();
  });

  it("no consulta ni modifica si la verificación de rol falla", async () => {
    vi.mocked(requerirRol).mockRejectedValue(new Error("Sin acceso"));
    await expect(consultarCobroAnticipadoAction()).rejects.toThrow("Sin acceso");
    const form = new FormData();
    form.set("activo", "true");
    await expect(actualizarCobroAnticipadoAction(form)).rejects.toThrow("Sin acceso");
    expect(obtenerCobroAnticipado).not.toHaveBeenCalled();
    expect(guardarCobroAnticipado).not.toHaveBeenCalled();
  });
});
