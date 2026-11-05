import { beforeEach, describe, expect, it, vi } from "vitest";
import { puedeReportarIncidencia, tieneIncidenciaAbierta } from "../../src/features/cocina/cocina-logica";
import { TIPOS_INCIDENCIA_COCINA, ETIQUETA_TIPO_INCIDENCIA } from "../../src/features/pedidos/incidencias";
import type { PedidoCocina } from "../../src/features/cocina/tipos";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { listarPedidosCocina } from "../../src/features/cocina/pedidos-cocina";

const abierta: PedidoCocina["incidenciasAbiertas"][number] = {
  id: "incidencia-1", tipo: "SIN_INGREDIENTES", descripcion: "No hay limón", creadaEn: "2026-11-01T16:00:00Z",
};

describe("incidencias de cocina US-017", () => {
  it.each([
    ["PENDING", false], ["ACCEPTED", true], ["IN_PROGRESS", true],
    ["READY", true], ["DELIVERED", false], ["CANCELLED", false],
  ] as const)("reportar en %s: %s", (estado, permitido) => {
    expect(puedeReportarIncidencia(estado)).toBe(permitido);
  });

  it("detecta pedidos con una o varias incidencias abiertas", () => {
    expect(tieneIncidenciaAbierta({ incidenciasAbiertas: [abierta] })).toBe(true);
    expect(tieneIncidenciaAbierta({ incidenciasAbiertas: [abierta, { ...abierta, id: "otra" }] })).toBe(true);
  });

  it("no destaca pedidos sin incidencias abiertas", () => {
    expect(tieneIncidenciaAbierta({ incidenciasAbiertas: [] })).toBe(false);
  });

  it("ofrece solo los tres tipos coordinados para cocina y todos tienen etiqueta", () => {
    expect(TIPOS_INCIDENCIA_COCINA).toEqual(["SIN_INGREDIENTES", "PROBLEMA_PREPARACION", "OTRO"]);
    for (const tipo of TIPOS_INCIDENCIA_COCINA) expect(ETIQUETA_TIPO_INCIDENCIA[tipo]).toBeTruthy();
  });
});

beforeEach(() => vi.resetAllMocks());

describe("mapeo de la consulta de cocina US-017", () => {
  it.each([
    [[], []],
    [[{ id: "cerrada", type: "OTRO", description: "Ya atendido", status: "RESOLVED", created_at: abierta.creadaEn }], []],
    [[
      { id: abierta.id, type: abierta.tipo, description: abierta.descripcion, status: "OPEN", created_at: abierta.creadaEn },
      { id: "cerrada", type: "OTRO", description: "Ya atendido", status: "RESOLVED", created_at: abierta.creadaEn },
    ], [abierta]],
  ])("devuelve solo incidencias OPEN: %j", async (incidencias, esperado) => {
    const cliente = {
      from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ error: null, data: [{
        id: "pedido-1", order_number: 42, created_at: abierta.creadaEn, status: "ACCEPTED", modality: "DINE_IN", source: "QR",
        customer_name: null, dining_tables: { number: 2 }, order_items: [], order_incidents: incidencias,
      }] }),
    };
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
    const pedidos = await listarPedidosCocina("restaurante-1");
    expect(pedidos[0].incidenciasAbiertas).toEqual(esperado);
    expect(cliente.eq).toHaveBeenCalledExactlyOnceWith("restaurant_id", "restaurante-1");
    expect(cliente.select.mock.calls[0][0]).toContain("order_incidents(id, type, description, status, created_at)");
  });
});
