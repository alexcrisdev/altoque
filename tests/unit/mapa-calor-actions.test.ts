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

vi.mock("../../src/features/dashboard/mapa-calor", () => ({
  obtenerMapaCalor: vi.fn(),
}));

import { requerirRol } from "../../src/features/auth/sesion";
import { obtenerMapaCalor } from "../../src/features/dashboard/mapa-calor";
import { consultarMapaCalorAction } from "../../src/features/dashboard/mapa-calor-actions";
import {
  calcularMapaCalor,
  type FiltroMapa,
} from "../../src/features/dashboard/mapa-calor-logica";

type Membresias =
  Awaited<ReturnType<typeof requerirRol>>["membresias"];

const filtro: FiltroMapa = {
  desde: "2026-11-02",
  hasta: "2026-11-15",
  horaDesde: 11,
  horaHasta: 22,
  diasAbiertos: [0, 1, 2, 3, 4, 5, 6],
};

const mapa = {
  ...calcularMapaCalor([], filtro),
  productos: [],
};

function simularSesion(membresias: Membresias) {
  vi.mocked(requerirRol).mockResolvedValue({
    usuario: {} as never,
    membresias,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(obtenerMapaCalor).mockResolvedValue(mapa);
});

describe("autorización del mapa de calor US-084", () => {
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
        await consultarMapaCalorAction(filtro),
      ).toEqual({ ok: true, mapa });

      expect(requerirRol).toHaveBeenCalledExactlyOnceWith([
        "OWNER",
        "ADMIN",
      ]);
      expect(obtenerMapaCalor).toHaveBeenCalledExactlyOnceWith(
        "restaurante-autorizado",
        filtro,
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

    await consultarMapaCalorAction(filtro);

    expect(obtenerMapaCalor).toHaveBeenCalledExactlyOnceWith(
      "restaurante-como-admin",
      filtro,
    );
  });

  it("no consulta sin una membresía autorizada", async () => {
    simularSesion([
      {
        restaurantId: "restaurante-como-mesero",
        branchId: null,
        rol: "WAITER",
      },
    ]);

    expect(
      await consultarMapaCalorAction(filtro),
    ).toEqual({
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    });

    expect(obtenerMapaCalor).not.toHaveBeenCalled();
  });

  it("conserva la redirección de acceso sin consultar", async () => {
    const interrupcion = new Error("Acceso interrumpido");
    vi.mocked(requerirRol).mockRejectedValue(interrupcion);

    await expect(
      consultarMapaCalorAction(filtro),
    ).rejects.toBe(interrupcion);

    expect(obtenerMapaCalor).not.toHaveBeenCalled();
  });

  it.each([
    { desde: "2026-11-16" },
    { horaDesde: 22, horaHasta: 11 },
  ])("rechaza filtros inválidos antes de consultar: %j", async (cambio) => {
    simularSesion([
      {
        restaurantId: "restaurante-autorizado",
        branchId: null,
        rol: "OWNER",
      },
    ]);

    expect(
      await consultarMapaCalorAction({
        ...filtro,
        ...cambio,
      }),
    ).toEqual({
      ok: false,
      mensaje: "Revisa las fechas, el horario y el plato seleccionado.",
    });

    expect(obtenerMapaCalor).not.toHaveBeenCalled();
  });

  it("oculta detalles internos cuando falla la consulta", async () => {
    simularSesion([
      {
        restaurantId: "restaurante-autorizado",
        branchId: null,
        rol: "ADMIN",
      },
    ]);

    vi.mocked(obtenerMapaCalor).mockRejectedValue(
      new Error("Detalle privado de la base"),
    );

    expect(
      await consultarMapaCalorAction(filtro),
    ).toEqual({
      ok: false,
      mensaje: "No se pudo consultar el mapa de calor. Intenta de nuevo.",
    });
  });
});