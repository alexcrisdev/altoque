import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: vi.fn() }));
vi.mock("../../src/features/dashboard/ventas-csv", () => ({ obtenerFilasVentasCsv: vi.fn() }));

import { obtenerSesion } from "../../src/features/auth/sesion";
import { obtenerFilasVentasCsv } from "../../src/features/dashboard/ventas-csv";
import { GET } from "../../src/app/api/admin/reportes/ventas/route";

const url = "http://localhost/api/admin/reportes/ventas?desde=2026-11-01&hasta=2026-11-12";
const venta = {
  fechaHora: "12/11/2026, 10:00:00", pagoId: "pago-1", cuentaId: "sesion-1",
  importeCentimos: 1250, modalidad: "En mesa",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(obtenerFilasVentasCsv).mockResolvedValue([venta]);
});

describe("GET /api/admin/reportes/ventas", () => {
  it("permite a OWNER y aplica filtros y restaurante autorizados", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "restaurante-propio", branchId: null, rol: "OWNER" }],
    });
    const respuesta = await GET(new Request(url));
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-disposition")).toMatch(/altoque-ventas-\d{4}-\d{2}-\d{2}\.csv/);
    expect(Array.from(new Uint8Array(await respuesta.arrayBuffer()).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(obtenerFilasVentasCsv).toHaveBeenCalledWith("restaurante-propio", "2026-11-01", "2026-11-12");
  });

  it.each(["ADMIN", "WAITER", "KITCHEN", "CASHIER"] as const)("devuelve 403 a %s", async (rol) => {
    vi.mocked(obtenerSesion).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "otro", branchId: null, rol }],
    });
    expect((await GET(new Request(url))).status).toBe(403);
    expect(obtenerFilasVentasCsv).not.toHaveBeenCalled();
  });

  it("devuelve un mensaje y no genera un CSV si no hay ventas", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "r1", branchId: null, rol: "OWNER" }],
    });
    vi.mocked(obtenerFilasVentasCsv).mockResolvedValue([]);
    const respuesta = await GET(new Request(url));
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toContain("No hay ventas confirmadas");
    expect(respuesta.headers.get("content-type")).toContain("text/plain");
  });

  it("distingue un error de consulta de la ausencia de ventas", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "r1", branchId: null, rol: "OWNER" }],
    });
    vi.mocked(obtenerFilasVentasCsv).mockRejectedValue(new Error("error de DB"));
    expect((await GET(new Request(url))).status).toBe(500);
  });

  it("rechaza fechas inválidas sin consultar datos", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "r1", branchId: null, rol: "OWNER" }],
    });
    expect((await GET(new Request("http://localhost/api/admin/reportes/ventas?desde=x&hasta=2026-11-12"))).status).toBe(400);
    expect(obtenerFilasVentasCsv).not.toHaveBeenCalled();
  });
});
