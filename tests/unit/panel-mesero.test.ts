import { beforeEach, describe, expect, it, vi } from "vitest";
import { agruparPorMesa, GRUPO_PARA_LLEVAR, minutosDesde, pedidosQueRequierenAtencion, prioridadPedido, resumenMesa } from "../../src/features/mesero/panel-logica";
import type { PedidoActivo } from "../../src/features/mesero/pedidos-activos";
import { ESTADOS_ACTIVOS, type EstadoPedido } from "../../src/features/pedidos/estados";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/mesero/sesiones", () => ({ listarMesasConSesion: vi.fn() }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { requerirRol } from "../../src/features/auth/sesion";
import { listarMesasConSesion } from "../../src/features/mesero/sesiones";
import { listarPedidosActivos } from "../../src/features/mesero/pedidos-activos";
import { obtenerPanelMesero } from "../../src/features/mesero/panel-actions";

const ahora = "2026-11-01T15:10:00Z";
function pedido(id: string, estado: EstadoPedido = "PENDING", cambios: Partial<PedidoActivo> = {}): PedidoActivo {
  return { id, numero: 42, creadoEn: "2026-11-01T15:04:00Z", estado, modalidad: "DINE_IN",
    mesaId: "mesa-1", mesaNumero: 1, nombreCliente: null, asistido: false, ...cambios };
}

describe("prioridadPedido", () => {
  it.each([["READY", 1], ["PENDING", 2], ["ACCEPTED", 3], ["IN_PROGRESS", 3], ["DELIVERED", 4], ["CANCELLED", 4]] as const)(
    "asigna prioridad %s → %s", (estado, prioridad) => expect(prioridadPedido(estado)).toBe(prioridad),
  );
});

describe("pedidosQueRequierenAtencion", () => {
  it("prioriza listos y ordena cada prioridad por antigüedad sin modificar la entrada", () => {
    const pedidos = [pedido("pendiente"), pedido("listo-nuevo", "READY", { creadoEn: "2026-11-01T15:09:00Z" }),
      pedido("listo-antiguo", "READY"), pedido("pendiente-antiguo", "PENDING", { creadoEn: "2026-11-01T15:00:00Z" })];
    const original = structuredClone(pedidos);
    expect(pedidosQueRequierenAtencion(pedidos, ahora).map((p) => p.id))
      .toEqual(["listo-antiguo", "listo-nuevo", "pendiente-antiguo", "pendiente"]);
    expect(pedidos).toEqual(original);
  });
  it.each([[4, false], [5, false], [6, true]])("pendiente de %s minutos requiere atención: %s", (minutos, entra) => {
    const p = pedido("pendiente", "PENDING", { creadoEn: new Date(Date.parse(ahora) - minutos * 60_000).toISOString() });
    expect(pedidosQueRequierenAtencion([p], ahora)).toHaveLength(entra ? 1 : 0);
  });
  it("incluye al superar exactamente los cinco minutos y excluye futuros/fechas inválidas", () => {
    const p = pedido("cinco-y-un-segundo", "PENDING", { creadoEn: "2026-11-01T15:04:59Z" });
    expect(pedidosQueRequierenAtencion([p, pedido("futuro", "PENDING", { creadoEn: "2026-11-01T15:11:00Z" }),
      pedido("invalido", "PENDING", { creadoEn: "invalida" })], ahora).map((p) => p.id)).toEqual([p.id]);
  });
  it("excluye aceptados, en preparación, entregados y cancelados aunque sean antiguos", () => {
    const estados: EstadoPedido[] = ["ACCEPTED", "IN_PROGRESS", "DELIVERED", "CANCELLED"];
    expect(pedidosQueRequierenAtencion(estados.map((e) => pedido(e, e)), ahora)).toEqual([]);
  });
  it("admite reloj Date/número y listas vacías", () => {
    expect(pedidosQueRequierenAtencion([pedido("p")], new Date(ahora))).toHaveLength(1);
    expect(pedidosQueRequierenAtencion([pedido("p")], Date.parse(ahora))).toHaveLength(1);
    expect(pedidosQueRequierenAtencion([], ahora)).toEqual([]);
  });
});

describe("agruparPorMesa", () => {
  it("separa las mesas y agrupa para llevar incluso cuando conserva una mesa de origen", () => {
    const pedidos = [pedido("a"), pedido("b", "READY"), pedido("c", "ACCEPTED", { mesaId: "mesa-2", mesaNumero: 2 }),
      pedido("mostrador", "PENDING", { modalidad: "TAKEAWAY", mesaId: null, mesaNumero: null }),
      pedido("llevar-desde-mesa", "READY", { modalidad: "TAKEAWAY" })];
    const original = structuredClone(pedidos);
    const grupos = agruparPorMesa(pedidos);
    expect(grupos.get("mesa-1")?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(grupos.get("mesa-2")?.map((p) => p.id)).toEqual(["c"]);
    expect(grupos.get(GRUPO_PARA_LLEVAR)?.map((p) => p.id)).toEqual(["mostrador", "llevar-desde-mesa"]);
    expect(pedidos).toEqual(original);
  });
  it("no mezcla un pedido en local sin mesa con para llevar", () => {
    const grupos = agruparPorMesa([pedido("sin-mesa", "PENDING", { mesaId: null })]);
    expect(grupos.get("SIN_MESA")).toHaveLength(1);
    expect(grupos.has(GRUPO_PARA_LLEVAR)).toBe(false);
  });
  it("devuelve un Map vacío sin pedidos", () => expect(agruparPorMesa([]).size).toBe(0));
});

describe("resumenMesa y minutosDesde", () => {
  it("cuenta total, listos y pendientes de aceptar", () => {
    expect(resumenMesa([pedido("a"), pedido("b", "READY"), pedido("c", "READY"), pedido("d", "ACCEPTED"), pedido("e", "IN_PROGRESS")]))
      .toEqual({ total: 5, listos: 2, pendientes: 1 });
  });
  it("resume una mesa sin pedidos", () => expect(resumenMesa([])).toEqual({ total: 0, listos: 0, pendientes: 0 }));
  it("reutiliza el cálculo de cocina con zonas horarias y sin valores negativos", () => {
    expect(minutosDesde("2026-11-01T10:04:00-05:00", ahora)).toBe(6);
    expect(minutosDesde("2026-11-01T15:11:00Z", ahora)).toBe(0);
    expect(minutosDesde("invalida", ahora)).toBe(0);
  });
});

const fila = { id: "pedido-1", order_number: 42, created_at: ahora, status: "READY", modality: "DINE_IN",
  dining_table_id: "mesa-1", dining_tables: { number: 1 }, customer_name: null, source: "WAITER" };
function consulta(data: unknown[] = [fila], error: { code: string; message: string } | null = null) {
  const cliente = { from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), overrideTypes: vi.fn().mockResolvedValue({ data, error }) };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  return cliente;
}
beforeEach(() => vi.resetAllMocks());

describe("consulta segura de pedidos activos", () => {
  it("filtra restaurante y estados activos, ordena por llegada y no solicita teléfonos", async () => {
    const cliente = consulta();
    expect(await listarPedidosActivos("cevicheria")).toEqual([pedido("pedido-1", "READY", { creadoEn: ahora, asistido: true })]);
    expect(cliente.eq).toHaveBeenCalledExactlyOnceWith("restaurant_id", "cevicheria");
    expect(cliente.in).toHaveBeenCalledExactlyOnceWith("status", ESTADOS_ACTIVOS);
    expect(cliente.order).toHaveBeenCalledExactlyOnceWith("created_at", { ascending: true });
    expect(cliente.select).toHaveBeenCalledExactlyOnceWith("id, order_number, created_at, status, modality, dining_table_id, dining_tables(number), customer_name, source");
  });
  it("devuelve una lista vacía solo cuando la consulta fue correcta", async () => {
    consulta([]);
    expect(await listarPedidosActivos("cevicheria")).toEqual([]);
  });
  it("conserva nombre/modalidad para llevar sin mesa", async () => {
    consulta([{ ...fila, modality: "TAKEAWAY", dining_table_id: null, dining_tables: null, customer_name: "Cliente demo", source: "QR" }]);
    expect(await listarPedidosActivos("cevicheria")).toMatchObject([{ modalidad: "TAKEAWAY", mesaId: null, mesaNumero: null, nombreCliente: "Cliente demo", asistido: false }]);
  });
  it("lanza error y registra solo el código si Supabase falla", async () => {
    consulta([], { code: "42501", message: "Información privada" });
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(listarPedidosActivos("cevicheria")).rejects.toThrow("No se pudieron cargar los pedidos activos.");
      expect(registro).toHaveBeenCalledExactlyOnceWith("listarPedidosActivos", "42501");
    } finally { registro.mockRestore(); }
  });
});

describe("autorización del panel mesero", () => {
  function sesion() {
    vi.mocked(requerirRol).mockResolvedValue({ usuario: { id: "mesero" }, membresias: [
      { restaurantId: "otro", branchId: null, rol: "KITCHEN" },
      { restaurantId: "cevicheria", branchId: null, rol: "WAITER" },
    ] } as Awaited<ReturnType<typeof requerirRol>>);
    vi.mocked(listarMesasConSesion).mockResolvedValue([]);
  }
  it("obtiene ambos conjuntos desde la membresía autorizada", async () => {
    sesion(); const cliente = consulta();
    const resultado = await obtenerPanelMesero();
    expect(requerirRol).toHaveBeenCalledExactlyOnceWith(["WAITER", "OWNER", "ADMIN"]);
    expect(listarMesasConSesion).toHaveBeenCalledExactlyOnceWith("cevicheria");
    expect(cliente.eq).toHaveBeenCalledWith("restaurant_id", "cevicheria");
    expect(resultado).toMatchObject({ ok: true, mesas: [], pedidos: [{ id: "pedido-1" }] });
  });
  it("no consulta datos si falla el permiso", async () => {
    vi.mocked(requerirRol).mockRejectedValue(new Error("Sin permiso"));
    await expect(obtenerPanelMesero()).rejects.toThrow("Sin permiso");
    expect(crearClienteServidor).not.toHaveBeenCalled();
    expect(listarMesasConSesion).not.toHaveBeenCalled();
  });
  it("distingue un error de carga de un panel vacío", async () => {
    sesion(); consulta();
    vi.mocked(listarMesasConSesion).mockRejectedValue(new Error("Sin conexión"));
    expect(await obtenerPanelMesero()).toEqual({ ok: false, restauranteId: "cevicheria" });
  });
});
