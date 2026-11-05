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

vi.mock("../../src/features/dashboard/tendencias", () => ({
  obtenerTendencias: vi.fn(),
}));

// No necesitamos consultar ventas para probar esta acción.
vi.mock("../../src/features/dashboard/ventas", () => ({
  obtenerResumenVentas: vi.fn(),
}));

import { requerirRol } from "../../src/features/auth/sesion";
import { obtenerTendencias } from "../../src/features/dashboard/tendencias";
import { consultarTendenciasAction } from "../../src/features/dashboard/actions";

type Membresias =
  Awaited<ReturnType<typeof requerirRol>>["membresias"];

const desde = "2026-11-04";
const hasta = "2026-11-04";

const tendencias = {
  productos: [
    {
      productId: "producto-1",
      nombre: "Ceviche",
      unidades: 5,
    },
  ],
  porEstado: {
    PENDING: 1,
    ACCEPTED: 0,
    IN_PROGRESS: 0,
    READY: 0,
    DELIVERED: 1,
    CANCELLED: 1,
  },
  total: 3,
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
  vi.mocked(obtenerTendencias).mockResolvedValue(tendencias);
});

describe("autorización de tendencias US-019", () => {
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
        await consultarTendenciasAction(desde, hasta),
      ).toEqual({ ok: true, tendencias });

      expect(requerirRol).toHaveBeenCalledExactlyOnceWith([
        "OWNER",
        "ADMIN",
      ]);

      expect(obtenerTendencias).toHaveBeenCalledExactlyOnceWith(
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

    await consultarTendenciasAction(desde, hasta);

    expect(obtenerTendencias).toHaveBeenCalledExactlyOnceWith(
      "restaurante-como-admin",
      desde,
      hasta,
    );
  });

  it("no consulta sin una membresía autorizada", async () => {
    simularSesion([]);

    expect(
      await consultarTendenciasAction(desde, hasta),
    ).toEqual({
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    });

    expect(obtenerTendencias).not.toHaveBeenCalled();
  });

  it("conserva la interrupción de acceso sin consultar tendencias", async () => {
    const interrupcion = new Error("Acceso interrumpido");

    vi.mocked(requerirRol).mockRejectedValue(interrupcion);

    await expect(
      consultarTendenciasAction(desde, hasta),
    ).rejects.toBe(interrupcion);

    expect(obtenerTendencias).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-11-05", "2026-11-04"],
    ["fecha-invalida", "2026-11-04"],
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

      const resultado = await consultarTendenciasAction(
        inicio,
        fin,
      );

      expect(resultado.ok).toBe(false);
      expect(obtenerTendencias).not.toHaveBeenCalled();
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

    vi.mocked(obtenerTendencias).mockRejectedValue(
      new Error("Información privada de la base"),
    );

    expect(
      await consultarTendenciasAction(desde, hasta),
    ).toEqual({
      ok: false,
      mensaje:
        "No se pudieron consultar las tendencias. Intenta de nuevo.",
    });
  });
});
