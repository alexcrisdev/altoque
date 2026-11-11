import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { asignarAtajos, colorEspera, crearSeguimientoNuevos, deshacerVigente, diaLima, numeroAtajo, pedidosDelDia, resumenPreparacion } from "../../src/features/cocina/kds-logica";
import type { PedidoCocina } from "../../src/features/cocina/tipos";

const ahora = Date.parse("2026-11-11T16:00:00Z");
const pedido: PedidoCocina = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", numero: 1, creadoEn: new Date(ahora).toISOString(), estado: "IN_PROGRESS",
  modalidad: "DINE_IN", asistido: false, mesaNumero: 1, nombreCliente: null,
  items: [{ nombre: "Ceviche clásico", cantidad: 2, observacion: "Sin ají", alergenos: ["Pescado"] }], incidenciasAbiertas: [],
};

describe("US-080: reglas del tablero", () => {
  it("delimita el día de Lima incluso antes de medianoche UTC", () => {
    expect(diaLima(Date.parse("2026-11-12T04:59:59Z"))).toEqual({ inicio: "2026-11-11T05:00:00.000Z", fin: "2026-11-12T05:00:00.000Z" });
  });
  it("excluye ayer y mañana y ordena los pedidos de hoy por antigüedad", () => {
    expect(pedidosDelDia([
      pedido, { ...pedido, id: "antiguo", creadoEn: "2026-11-11T05:00:00Z" },
      { ...pedido, id: "ayer", creadoEn: "2026-11-11T04:59:59Z" },
      { ...pedido, id: "mañana", creadoEn: "2026-11-12T05:00:00Z" },
    ], ahora).map((p) => p.id)).toEqual(["antiguo", pedido.id]);
  });
  it("suma cantidades solo de preparación", () => {
    expect(resumenPreparacion([pedido, { ...pedido, id: "otro", items: [{ ...pedido.items[0], cantidad: 4 }] }, { ...pedido, estado: "READY" }]))
      .toEqual([{ nombre: "Ceviche clásico", cantidad: 6 }]);
  });
  it.each([[0, "verde"], [599999, "verde"], [600000, "amarillo"], [1199999, "amarillo"], [1200000, "rojo"]] as const)("colorea a los %s ms", (espera, color) => {
    expect(colorEspera(new Date(ahora - espera).toISOString(), ahora)).toBe(color);
  });
  it.each([[0, true], [4999, true], [5000, false], [-1, false]] as const)("limita Deshacer a cinco segundos (%s)", (edad, vigente) => {
    expect(deshacerVigente(new Date(ahora - edad).toISOString(), ahora)).toBe(vigente);
  });
  it("rechaza Deshacer sin fecha", () => expect(deshacerVigente(null, ahora)).toBe(false));
  const evento = { key: "1", code: "Digit1", repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  it.each(Array.from({ length: 10 }, (_, i) => i))("acepta teclado y numérico para %s", (n) => {
    expect(numeroAtajo({ ...evento, key: String(n), code: `Digit${n}` }, false)).toBe(n);
    expect(numeroAtajo({ ...evento, key: "End", code: `Numpad${n}` }, false)).toBe(n);
  });
  it("ignora repetición, edición y combinaciones del navegador", () => {
    expect(numeroAtajo(evento, true)).toBeNull();
    for (const campo of ["repeat", "altKey", "ctrlKey", "metaKey", "shiftKey"]) expect(numeroAtajo({ ...evento, [campo]: true }, false)).toBeNull();
  });
  it("asigna 1–9 por FIFO y desempata por número sin incluir listos", () => {
    const lista = Array.from({ length: 10 }, (_, i) => ({ ...pedido, id: String(10 - i), numero: 10 - i }));
    const teclas = asignarAtajos([...lista, { ...pedido, id: "listo", estado: "READY" }]);
    expect(teclas).toEqual(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), i + 1])));
  });
  it("no desplaza ni reutiliza teclas cuando un pedido sale o vuelve por Deshacer", () => {
    const segundo = { ...pedido, id: "segundo", numero: 2 };
    const primero = asignarAtajos([pedido, segundo]);
    const sinPrimero = asignarAtajos([segundo], primero);
    expect(sinPrimero).toEqual(primero);
    expect(asignarAtajos([pedido, segundo], sinPrimero)).toEqual(primero);
    expect(asignarAtajos([segundo])).toEqual({ segundo: 1 });
  });
  it("llena teclas nunca usadas sin cambiar las anteriores", () => {
    const primero = asignarAtajos([pedido]);
    expect(asignarAtajos([{ ...pedido, id: "nuevo" }], primero)).toEqual({ [pedido.id]: 1, nuevo: 2 });
  });
  it("no vuelve a sonar por un pedido conocido tras desaparecer, reconectar o deshacer", () => {
    const observar = crearSeguimientoNuevos();
    expect(observar([pedido])).toBe(false);
    expect(observar([])).toBe(false);
    expect(observar([pedido])).toBe(false);
    const nuevo = { ...pedido, id: "nuevo" };
    expect(observar([pedido, nuevo])).toBe(true);
    expect(observar([pedido, nuevo])).toBe(false);
    expect(observar([{ ...nuevo, estado: "READY" }])).toBe(false);
    expect(observar([nuevo])).toBe(false);
  });
});

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/cocina/pedidos-cocina", () => ({ listarPedidosCocina: vi.fn() }));
vi.mock("../../src/features/pedidos/estado-actions", () => ({ cambiarEstadoPedido: vi.fn() }));
import { requerirRol } from "../../src/features/auth/sesion";
import { listarPedidosCocina } from "../../src/features/cocina/pedidos-cocina";
import { cambiarEstadoPedido } from "../../src/features/pedidos/estado-actions";
import { cambiarEstadoKds, obtenerKds } from "../../src/features/cocina/kds-actions";

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(ahora);
  vi.mocked(requerirRol).mockResolvedValue({ usuario: { id: "cocinero" }, membresias: [{ restaurantId: "restaurante", branchId: null, rol: "KITCHEN" }] } as Awaited<ReturnType<typeof requerirRol>>);
  vi.mocked(listarPedidosCocina).mockResolvedValue([pedido]);
  vi.mocked(cambiarEstadoPedido).mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("US-080: autorización y acciones", () => {
  it("lee el restaurante de la sesión y exige rol de cocina", async () => {
    expect((await obtenerKds()).ok).toBe(true);
    expect(requerirRol).toHaveBeenCalledWith(["KITCHEN", "OWNER", "ADMIN"]);
    expect(listarPedidosCocina).toHaveBeenCalledWith("restaurante", ahora);
  });
  it("no lee ni escribe sin autorización", async () => {
    vi.mocked(requerirRol).mockRejectedValue(new Error("Sin permiso"));
    await expect(cambiarEstadoKds(pedido.id)).rejects.toThrow("Sin permiso");
    expect(listarPedidosCocina).not.toHaveBeenCalled();
    expect(cambiarEstadoPedido).not.toHaveBeenCalled();
  });
  it("no cambia un pedido que no pertenece al restaurante y día consultados", async () => {
    vi.mocked(listarPedidosCocina).mockResolvedValue([]);
    expect((await cambiarEstadoKds(pedido.id)).ok).toBe(false);
    expect(cambiarEstadoPedido).not.toHaveBeenCalled();
  });
  it("marca listo sin paso intermedio ni confirmación", async () => {
    expect(await cambiarEstadoKds(pedido.id)).toEqual({ ok: true });
    expect(cambiarEstadoPedido).toHaveBeenCalledWith(pedido.id, "READY");
  });
  it.each(["CANCELLED", "DELIVERED", "READY"] as const)("rechaza avanzar desde %s", async (estado) => {
    vi.mocked(listarPedidosCocina).mockResolvedValue([{ ...pedido, estado }]);
    expect((await cambiarEstadoKds(pedido.id)).ok).toBe(false);
    expect(cambiarEstadoPedido).not.toHaveBeenCalled();
  });
  it.each([[4999, true], [5000, true], [300000, true], [300001, false]] as const)("conserva en servidor los cinco minutos de US-069 (%s ms)", async (edad, ok) => {
    vi.mocked(listarPedidosCocina).mockResolvedValue([{ ...pedido, estado: "READY", listoEn: new Date(ahora - edad).toISOString() }]);
    expect((await cambiarEstadoKds(pedido.id, true)).ok).toBe(ok);
    expect(cambiarEstadoPedido).toHaveBeenCalledTimes(ok ? 1 : 0);
  });
  it("distingue fallo de lectura de un panel vacío", async () => {
    vi.mocked(listarPedidosCocina).mockRejectedValue(new Error("Privado"));
    expect(await obtenerKds()).toEqual({ ok: false, restauranteId: "restaurante" });
  });
});
