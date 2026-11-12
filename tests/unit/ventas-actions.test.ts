import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../src/features/auth/sesion", () => ({
  requerirRol: vi.fn(),
}));

vi.mock("../../src/features/dashboard/ventas", () => ({
  obtenerResumenVentas: vi.fn(),
}));

import { requerirRol } from "../../src/features/auth/sesion";
import { obtenerResumenVentas } from "../../src/features/dashboard/ventas";
import { consultarVentasAction } from "../../src/features/dashboard/actions";

type Membresias =
  Awaited<ReturnType<typeof requerirRol>>["membresias"];

const desde = "2026-11-02";
const hasta = "2026-11-02";

const resumen = {
  ventasCentimos: 1000,
  cuentasPagadas: 1,
  ticketPromedioCentimos: 1000,
  porMetodo: { CASH: 1000, YAPE: 0, CARD: 0 },
};

function simularSesion(membresias: Membresias) {
  vi.mocked(requerirRol).mockResolvedValue({
    // La acción solo utiliza las membresías.
    usuario: {} as never,
    membresias,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(obtenerResumenVentas).mockResolvedValue(resumen);
});

describe("autorización del reporte US-018", () => {
  it.each(["OWNER", "ADMIN"] as const)(
    "consulta el restaurante de la membresía %s",
    async (rol) => {
      simularSesion([
        {
          restaurantId: "restaurante-autorizado",
          branchId: null,
          rol,
        },
      ]);

      expect(
        await consultarVentasAction(desde, hasta),
      ).toEqual({ ok: true, resumen });

      expect(requerirRol).toHaveBeenCalledExactlyOnceWith([
        "OWNER",
        "ADMIN",
      ]);

      expect(obtenerResumenVentas).toHaveBeenCalledExactlyOnceWith(
        "restaurante-autorizado",
        desde,
        hasta,
      );
    },
  );

  it("elige la membresía administrativa aunque no sea la primera", async () => {
    simularSesion([
      {
        restaurantId: "restaurante-como-mesero",
        branchId: null,
        rol: "WAITER",
      },
      {
        restaurantId: "restaurante-como-admin",
        branchId: null,
        rol: "ADMIN",
      },
    ]);

    await consultarVentasAction(desde, hasta);

    expect(obtenerResumenVentas).toHaveBeenCalledExactlyOnceWith(
      "restaurante-como-admin",
      desde,
      hasta,
    );
  });

  it("prioriza la membresía OWNER usada por la descarga CSV", async () => {
    simularSesion([
      { restaurantId: "restaurante-admin", branchId: null, rol: "ADMIN" },
      { restaurantId: "restaurante-owner", branchId: null, rol: "OWNER" },
    ]);

    await consultarVentasAction(desde, hasta);

    expect(obtenerResumenVentas).toHaveBeenCalledExactlyOnceWith(
      "restaurante-owner",
      desde,
      hasta,
    );
  });

  it("no consulta si falta una membresía autorizada", async () => {
    simularSesion([]);

    expect(
      await consultarVentasAction(desde, hasta),
    ).toEqual({
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    });

    expect(obtenerResumenVentas).not.toHaveBeenCalled();
  });

  it("conserva la interrupción de acceso sin consultar ventas", async () => {
    const interrupcion = new Error("Acceso interrumpido");

    vi.mocked(requerirRol).mockRejectedValue(interrupcion);

    await expect(
      consultarVentasAction(desde, hasta),
    ).rejects.toBe(interrupcion);

    expect(obtenerResumenVentas).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-11-03", "2026-11-02"],
    ["fecha-invalida", "2026-11-02"],
  ])(
    "no consulta el rango inválido %s a %s",
    async (inicio, fin) => {
      simularSesion([
        {
          restaurantId: "restaurante-autorizado",
          branchId: null,
          rol: "OWNER",
        },
      ]);

      const resultado = await consultarVentasAction(inicio, fin);

      expect(resultado.ok).toBe(false);
      expect(obtenerResumenVentas).not.toHaveBeenCalled();
    },
  );

  it("oculta los detalles internos cuando falla la consulta", async () => {
    simularSesion([
      {
        restaurantId: "restaurante-autorizado",
        branchId: null,
        rol: "ADMIN",
      },
    ]);

    vi.mocked(obtenerResumenVentas).mockRejectedValue(
      new Error("Detalle privado de la base"),
    );

    expect(
      await consultarVentasAction(desde, hasta),
    ).toEqual({
      ok: false,
      mensaje: "No se pudieron consultar las ventas. Intenta de nuevo.",
    });
  });
});
