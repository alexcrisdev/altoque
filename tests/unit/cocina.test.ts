import { describe, expect, it } from "vitest";
import { ordenarPorLlegada, agruparPorEstado, filtrarPorEstado, minutosDesde } from "../../src/features/cocina/cocina-logica";
import type { PedidoCocina } from "../../src/features/cocina/tipos";
import { renderizarCocinaHtml } from "../../src/features/cocina/html";

function pedido(id: string, estado: PedidoCocina["estado"], minuto: number): PedidoCocina {
  return {
    id, numero: minuto, estado, creadoEn: `2026-10-31T15:${String(minuto).padStart(2, "0")}:00Z`,
    modalidad: "DINE_IN", asistido: false, mesaNumero: 1, nombreCliente: null, telefono: null,
    items: [{ nombre: "Ceviche", cantidad: 2, observacion: "Sin ají" }],
  };
}
const pedidos = [pedido("nuevo", "PENDING", 20), pedido("preparacion", "IN_PROGRESS", 15),
  pedido("listo", "READY", 10), pedido("aceptado", "ACCEPTED", 5), pedido("antiguo", "PENDING", 1),
  pedido("entregado", "DELIVERED", 0), pedido("cancelado", "CANCELLED", 2)];

describe("vista HTML sin JavaScript", () => {
  it("muestra los pedidos, observaciones y enlaces sin scripts", () => {
    const html = renderizarCocinaHtml(pedidos, "PENDING", "2026-10-31T15:30:00Z");
    expect(html).toContain("N.º 20 · Nuevo");
    expect(html).toContain("Observación: Sin ají");
    expect(html).toContain('href="/cocina/html?estado=ACCEPTED"');
    expect(html).toContain('aria-current="page">Nuevos (2)');
    expect(html).not.toContain("<script");
    expect(html.indexOf("N.º 1 · Nuevo")).toBeLessThan(html.indexOf("N.º 20 · Nuevo"));
  });
  it("escapa contenido que podría interpretarse como HTML", () => {
    const peligroso = { ...pedidos[0], nombreCliente: '<script>alert("x")</script>', modalidad: "TAKEAWAY" as const,
      items: [{ nombre: "<img src=x>", cantidad: 1, observacion: "<script>robar()</script>" }] };
    const html = renderizarCocinaHtml([peligroso], "TODOS", "2026-10-31T15:30:00Z");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  it("distingue un fallo de lectura de una lista vacía", () => {
    expect(renderizarCocinaHtml([], "TODOS", "2026-10-31T15:30:00Z")).toContain("No hay pedidos pendientes");
    const error = renderizarCocinaHtml([], "TODOS", "2026-10-31T15:30:00Z", true);
    expect(error).toContain("No pudimos cargar los pedidos");
    expect(error).not.toContain("No hay pedidos pendientes");
  });
});

describe("orden y agrupación", () => {
  it("ordena por llegada sin modificar la entrada", () => {
    const original = [...pedidos];
    expect(ordenarPorLlegada(pedidos).map((p) => p.id)).toEqual(["entregado", "antiguo", "cancelado", "aceptado", "listo", "preparacion", "nuevo"]);
    expect(pedidos).toEqual(original);
  });
  it("separa los cuatro estados activos y ordena cada grupo", () => {
    const grupos = agruparPorEstado(pedidos);
    expect(grupos.PENDING.map((p) => p.id)).toEqual(["antiguo", "nuevo"]);
    expect(grupos.ACCEPTED.map((p) => p.id)).toEqual(["aceptado"]);
    expect(grupos.IN_PROGRESS.map((p) => p.id)).toEqual(["preparacion"]);
    expect(grupos.READY.map((p) => p.id)).toEqual(["listo"]);
  });
  it("devuelve grupos vacíos sin pedidos", () => {
    expect(agruparPorEstado([])).toEqual({ PENDING: [], ACCEPTED: [], IN_PROGRESS: [], READY: [] });
  });
  it("compara instantes aunque tengan diferentes zonas horarias", () => {
    const primero = { ...pedidos[0], id: "primero", creadoEn: "2026-10-31T10:00:00-05:00" };
    const segundo = { ...pedidos[0], id: "segundo", creadoEn: "2026-10-31T15:01:00Z" };
    expect(ordenarPorLlegada([segundo, primero]).map((p) => p.id)).toEqual(["primero", "segundo"]);
  });
});

describe("filtros", () => {
  it.each([
    ["TODOS", ["antiguo", "aceptado", "listo", "preparacion", "nuevo"]],
    ["PENDING", ["antiguo", "nuevo"]], ["ACCEPTED", ["aceptado"]],
    ["IN_PROGRESS", ["preparacion"]], ["READY", ["listo"]],
    ["desconocido", ["antiguo", "aceptado", "listo", "preparacion", "nuevo"]],
    [undefined, ["antiguo", "aceptado", "listo", "preparacion", "nuevo"]],
    [["PENDING", "READY"], ["antiguo", "aceptado", "listo", "preparacion", "nuevo"]],
  ])("filtra %s y excluye finalizados", (filtro, esperado) => {
    expect(filtrarPorEstado(pedidos, filtro).map((p) => p.id)).toEqual(esperado);
  });
  it("mantiene productos y observaciones", () => {
    expect(filtrarPorEstado(pedidos, "PENDING")[0].items).toEqual(pedidos[0].items);
  });
});

describe("minutosDesde", () => {
  it("cuenta minutos completos", () => {
    expect(minutosDesde("2026-10-31T15:00:00Z", "2026-10-31T15:07:59Z")).toBe(7);
  });
  it("acepta una fecha o una marca de tiempo", () => {
    const ahora = new Date("2026-10-31T15:01:00Z");
    expect(minutosDesde("2026-10-31T15:00:00Z", ahora)).toBe(1);
    expect(minutosDesde("2026-10-31T15:00:00Z", ahora.getTime())).toBe(1);
  });
  it("no devuelve minutos negativos ni NaN", () => {
    expect(minutosDesde("2026-10-31T16:00:00Z", "2026-10-31T15:00:00Z")).toBe(0);
    expect(minutosDesde("inválido", "2026-10-31T15:00:00Z")).toBe(0);
  });
});
import { beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { requerirRol } from "../../src/features/auth/sesion";
import { ESTADOS_ACTIVOS } from "../../src/features/pedidos/estados";
import { listarPedidosCocina } from "../../src/features/cocina/pedidos-cocina";
import { obtenerPanelCocina } from "../../src/features/cocina/actions";

const restauranteId = "restaurante-cocina";
const base = {
  id: "pedido-1", restaurant_id: restauranteId, order_number: 42,
  created_at: "2026-10-31T15:00:00Z", status: "PENDING", modality: "DINE_IN", source: "QR",
  customer_name: null, customer_phone: null, dining_tables: { number: 3 },
  order_items: [{ product_name: "Ceviche", quantity: 2, observation: "Sin ají" }],
};

function consulta(error: { code: string; message: string } | null = null) {
  let restaurante: string;
  let estados: string[];
  const filas = [base, { ...base, id: "otro", restaurant_id: "otro-restaurante" }, { ...base, id: "terminado", status: "DELIVERED" }];
  const cliente = {
    from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    eq: vi.fn((_campo: string, valor: string) => { restaurante = valor; return cliente; }),
    in: vi.fn((_campo: string, valores: string[]) => { estados = valores; return cliente; }),
    order: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn(async () => ({ error, data: filas.filter((p) => p.restaurant_id === restaurante && estados.includes(p.status)) })),
  };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  return cliente;
}

beforeEach(() => vi.resetAllMocks());

describe("lectura de cocina", () => {
  it("usa sesión, filtra restaurante y estados compartidos y ordena por llegada", async () => {
    const cliente = consulta();
    expect(await listarPedidosCocina(restauranteId)).toEqual([{
      id: "pedido-1", numero: 42, creadoEn: base.created_at, estado: "PENDING", modalidad: "DINE_IN",
      asistido: false, mesaNumero: 3, nombreCliente: null, telefono: null,
      items: [{ nombre: "Ceviche", cantidad: 2, observacion: "Sin ají" }],
    }]);
    expect(cliente.from).toHaveBeenCalledWith("orders");
    expect(cliente.eq).toHaveBeenCalledExactlyOnceWith("restaurant_id", restauranteId);
    expect(cliente.in).toHaveBeenCalledExactlyOnceWith("status", ESTADOS_ACTIVOS);
    expect(cliente.order).toHaveBeenCalledExactlyOnceWith("created_at", { ascending: true });
    expect(cliente.select).toHaveBeenCalledExactlyOnceWith("id, order_number, created_at, status, modality, source, customer_name, customer_phone, dining_tables(number), order_items(product_name, quantity, observation)");
  });

  it("un error no se confunde con una lista vacía y registra únicamente el código", async () => {
    consulta({ code: "42501", message: "Información privada" });
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(listarPedidosCocina(restauranteId)).rejects.toThrow("No se pudieron cargar los pedidos de cocina.");
      expect(registro).toHaveBeenCalledExactlyOnceWith("42501");
    } finally { registro.mockRestore(); }
  });
});

describe("autorización del panel", () => {
  function sesion() {
    vi.mocked(requerirRol).mockResolvedValue({
      usuario: { id: "cocinero" },
      membresias: [
        { restaurantId: "restaurante-sin-rol", branchId: null, rol: "WAITER" },
        { restaurantId: restauranteId, branchId: null, rol: "KITCHEN" },
      ],
    } as Awaited<ReturnType<typeof requerirRol>>);
  }

  it("deriva el restaurante de la membresía autorizada", async () => {
    sesion();
    const cliente = consulta();
    const resultado = await obtenerPanelCocina();
    expect(requerirRol).toHaveBeenCalledExactlyOnceWith(["KITCHEN", "OWNER", "ADMIN"]);
    expect(cliente.eq).toHaveBeenCalledWith("restaurant_id", restauranteId);
    expect(resultado).toMatchObject({ ok: true, restauranteId, pedidos: [{ id: "pedido-1" }] });
    if (!resultado.ok) throw new Error("Se esperaba una lectura correcta");
    expect(Number.isFinite(Date.parse(resultado.actualizadoEn))).toBe(true);
  });

  it("mantiene el fallo separado de una lectura correcta con cero pedidos", async () => {
    sesion();
    consulta({ code: "ERROR", message: "Privado" });
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await obtenerPanelCocina()).toEqual({ ok: false, restauranteId });
    } finally { registro.mockRestore(); }
  });

  it("no consulta pedidos si falla la autorización", async () => {
    vi.mocked(requerirRol).mockRejectedValue(new Error("Sin permiso"));
    await expect(obtenerPanelCocina()).rejects.toThrow("Sin permiso");
    expect(crearClienteServidor).not.toHaveBeenCalled();
  });
});

