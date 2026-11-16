import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock(
  "../../src/features/dashboard/resumen-diario",
  () => ({
    obtenerResumenDiario: vi.fn(),
    RestauranteResumenNoEncontrado:
      class extends Error {},
  }),
);

import {
  obtenerResumenDiario,
  RestauranteResumenNoEncontrado,
} from "../../src/features/dashboard/resumen-diario";
import {
  calcularResumenDiario,
} from "../../src/features/dashboard/resumen-diario-logica";
import {
  GET,
} from "../../src/app/api/n8n/resumen-diario/route";

const id = "10000000-0000-0000-0000-000000000001";
const token = "x".repeat(48);
const base = "http://localhost/api/n8n/resumen-diario";

const resumen = calcularResumenDiario({
  restaurante: { id, nombre: "Demo" },
  fecha: "2026-11-15",
  pedidos: [],
  pagos: [],
  cierres: [],
  predicciones: [],
});

function solicitud(
  query = `restaurante=${id}&fecha=2026-11-15`,
  authorization = `Bearer ${token}`,
) {
  return new Request(`${base}?${query}`, {
    headers: authorization
      ? { authorization }
      : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESUMEN_DIARIO_TOKEN", token);
  vi.mocked(obtenerResumenDiario)
    .mockResolvedValue(resumen);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("US-089: GET del resumen diario", () => {
  it("devuelve el resumen con token válido y sin caché", async () => {
    const respuesta = await GET(solicitud());

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control"))
      .toBe("no-store");
    expect(respuesta.headers.get("vary"))
      .toBe("Authorization");
    expect(await respuesta.json()).toEqual(resumen);

    expect(obtenerResumenDiario)
      .toHaveBeenCalledExactlyOnceWith(
        id,
        "2026-11-15",
      );
  });

  it.each([
    undefined,
    "",
    "corto",
    ` ${token}`,
  ])("sin configuración válida responde 503: %s", async valor => {
    vi.stubEnv("RESUMEN_DIARIO_TOKEN", valor);

    const respuesta = await GET(solicitud());

    expect(respuesta.status).toBe(503);
    expect(respuesta.headers.get("cache-control"))
      .toBe("no-store");
    expect(obtenerResumenDiario).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "Basic invalido",
    "Bearer incorrecto",
    `Bearer ${"y".repeat(48)}`,
    `Bearer ${token} extra`,
  ])("rechaza autorización incorrecta: %s", async authorization => {
    const respuesta = await GET(
      solicitud(undefined, authorization),
    );

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get("cache-control"))
      .toBe("no-store");
    expect(obtenerResumenDiario).not.toHaveBeenCalled();
    expect(await respuesta.text()).not.toContain(token);
  });

  it("autentica antes de procesar los parámetros", async () => {
    const respuesta = await GET(
      solicitud("restaurante=invalido", ""),
    );

    expect(respuesta.status).toBe(401);
  });

  it.each([
    "",
    "restaurante=invalido",
    `restaurante=${id}&restaurante=${id}`,
    `restaurante=${id}&fecha=`,
    `restaurante=${id}&fecha=2026-11-31`,
    `restaurante=${id}&fecha=2026-1-01`,
    `restaurante=${id}&fecha=9999-12-31`,
    `restaurante=${id}&fecha=2026-11-15&fecha=2026-11-15`,
  ])("rechaza parámetros inválidos: %s", async query => {
    const respuesta = await GET(solicitud(query));

    expect(respuesta.status).toBe(400);
    expect(respuesta.headers.get("cache-control"))
      .toBe("no-store");
    expect(obtenerResumenDiario).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-11-16T04:59:59Z", "2026-11-15"],
    ["2026-11-16T05:00:00Z", "2026-11-16"],
  ])("calcula la fecha predeterminada en Lima: %s", async (
    ahora,
    fecha,
  ) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ahora));

    const respuesta = await GET(
      solicitud(`restaurante=${id}`),
    );

    expect(respuesta.status).toBe(200);
    expect(obtenerResumenDiario)
      .toHaveBeenCalledWith(id, fecha);
  });

  it("responde 404 si el restaurante no existe", async () => {
    vi.mocked(obtenerResumenDiario).mockRejectedValue(
      new RestauranteResumenNoEncontrado(),
    );

    expect((await GET(solicitud())).status).toBe(404);
  });

  it("no expone mensajes internos de una consulta fallida", async () => {
    vi.mocked(obtenerResumenDiario).mockRejectedValue(
      new Error("Credencial o detalle privado"),
    );

    const respuesta = await GET(solicitud());

    expect(respuesta.status).toBe(500);
    expect(respuesta.headers.get("cache-control"))
      .toBe("no-store");
    expect(await respuesta.text())
      .not.toContain("detalle privado");
  });
});
