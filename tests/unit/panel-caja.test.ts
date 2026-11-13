import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/pago-cierre/acceso-caja", () => ({ requerirCaja: vi.fn() }));
vi.mock("../../src/features/mesero/sesiones", () => ({ listarMesasConSesion: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));

import { requerirCaja } from "../../src/features/pago-cierre/acceso-caja";
import { listarMesasConSesion } from "../../src/features/mesero/sesiones";
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { listarCuentasAbiertas } from "../../src/features/pago-cierre/cuentas";
import { obtenerPanelCaja } from "../../src/features/pago-cierre/panel-actions";

// Solo simula SELECT: cualquier intento de escritura carece de implementación.
function lecturas(nombre: string | null = "Cliente Demo", ocupada = false, estado = "IN_PROGRESS") {
  const filtros: { tabla: string; columna: string; valor: unknown }[] = [];
  const from = vi.fn((tabla: string) => {
    const pedidos = [{ id: "pedido-demo", order_number: 82, status: estado, created_at: "2026-11-11T15:00:00Z",
      table_session_id: null, customer_name: nombre,
      order_items: [{ product_name: "Producto demo", quantity: 1, unit_price: "12.50", observation: null }] }];
    const data = tabla === "table_sessions" && ocupada
      ? [{ id: "sesion-demo", opened_at: "2026-11-11T15:00:00Z", closed_at: null, dining_tables: { number: 5 } }]
      : tabla === "orders" ? pedidos : [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((columna: string, valor: unknown) => { filtros.push({ tabla, columna, valor }); return query; }),
      neq: vi.fn((columna: string, valor: unknown) => { filtros.push({ tabla, columna, valor }); return query; }),
      is: vi.fn(() => query),
      in: vi.fn((columna: string, valor: unknown) => { filtros.push({ tabla, columna, valor }); return query; }),
      order: vi.fn(() => query), limit: vi.fn(() => query),
      overrideTypes: vi.fn().mockResolvedValue({ data, error: null }),
    };
    return query;
  });
  vi.mocked(crearClienteServidor).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  return { from, filtros };
}

beforeEach(() => { vi.resetAllMocks(); });

describe("US-082: lectura del panel de caja", () => {
  it("US-085: conserva el pedido para llevar PENDING con saldo para poder cobrarlo", async () => {
    vi.mocked(requerirCaja).mockResolvedValue("restaurante-autorizado");
    const { filtros } = lecturas("Cliente espera pago", false, "PENDING");
    vi.mocked(listarMesasConSesion).mockResolvedValue([]);
    const resultado = await obtenerPanelCaja();
    expect(resultado.cuentas).toEqual([expect.objectContaining({
      href: "/caja/pedido/pedido-demo", titulo: "Para llevar #82 – Cliente espera pago",
      consumoCentimos: 1250, pagadoCentimos: 0, saldoCentimos: 1250,
    })]);
    expect(filtros.filter(filtro => filtro.tabla === "orders" && filtro.columna === "status"))
      .toEqual([{ tabla: "orders", columna: "status", valor: "CANCELLED" }]);
  });

  it("comprueba el acceso antes de consultar cuentas o mesas", async () => {
    vi.mocked(requerirCaja).mockRejectedValue(new Error("Sin permiso"));
    await expect(obtenerPanelCaja()).rejects.toThrow("Sin permiso");
    expect(crearClienteServidor).not.toHaveBeenCalled();
    expect(listarMesasConSesion).not.toHaveBeenCalled();
  });
  it("consulta solo el restaurante de la membresía y conserva importes", async () => {
    vi.mocked(requerirCaja).mockResolvedValue("restaurante-autorizado");
    const { filtros } = lecturas();
    const mesas = [{ id: "mesa-demo", numero: 5, sesion: null }];
    vi.mocked(listarMesasConSesion).mockResolvedValue(mesas);
    const resultado = await obtenerPanelCaja();
    expect(listarMesasConSesion).toHaveBeenCalledExactlyOnceWith("restaurante-autorizado");
    const restaurantes = filtros.filter(f => f.columna === "restaurant_id");
    expect(restaurantes.length).toBeGreaterThan(0);
    expect(restaurantes.every(f => f.valor === "restaurante-autorizado")).toBe(true);
    expect(resultado.mesas).toEqual(mesas);
    expect(resultado.cuentas[0]).toMatchObject({ titulo: "Para llevar #82 – Cliente Demo", consumoCentimos: 1250, saldoCentimos: 1250 });
  });
  it("propaga el fallo de sesiones en lugar de presentar las mesas como libres", async () => {
    vi.mocked(requerirCaja).mockResolvedValue("restaurante-autorizado");
    lecturas();
    vi.mocked(listarMesasConSesion).mockRejectedValue(new Error("No se pudieron cargar las sesiones"));
    await expect(obtenerPanelCaja()).rejects.toThrow("No se pudieron cargar las sesiones");
  });
});

describe("US-082: identificación de cuentas sin cambiar su saldo", () => {
  it.each([null, "", "   "])("identifica un pedido sin nombre (%j)", async nombre => {
    lecturas(nombre);
    const cuentas = await listarCuentasAbiertas("restaurante-autorizado");
    expect(cuentas[0]).toMatchObject({ titulo: "Para llevar #82 – Sin nombre", saldoCentimos: 1250 });
  });
  it("conserva el número de mesa aunque su sesión todavía no tenga pedidos", async () => {
    lecturas("Cliente Demo", true);
    const cuentas = await listarCuentasAbiertas("restaurante-autorizado");
    expect(cuentas.find(c => c.href === "/caja/mesa/sesion-demo"))
      .toMatchObject({ titulo: "Mesa 5", detalle: "0 pedido(s)", saldoCentimos: 0 });
  });
});
