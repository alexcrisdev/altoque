import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectarNuevos, textoAntiguedad } from "../../src/features/mesero/alertas-logica";
import type { EstadoPedido } from "../../src/features/pedidos/estados";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ requerirRol: vi.fn() }));

import { revalidatePath } from "next/cache";
import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { resolverAccesoQr } from "../../src/features/acceso-qr/acceso";
import { requerirRol } from "../../src/features/auth/sesion";
import { solicitarAyudaAction, atenderSolicitudAction } from "../../src/features/mesero/ayuda-actions";
import { listarSolicitudesAbiertas } from "../../src/features/mesero/ayuda";

const pedido = (id: string, estado: EstadoPedido = "PENDING") => ({ id, estado, numero: 31 });

describe("detectarNuevos", () => {
  it("no avisa con los pedidos anteriores de la primera carga", () => {
    expect(detectarNuevos(null, [pedido("viejo")])).toEqual([]);
  });
  it("devuelve únicamente los PENDING que no se habían visto", () => {
    const nuevo = pedido("nuevo");
    expect(detectarNuevos(new Set(["viejo"]), [pedido("viejo"), nuevo, pedido("listo", "READY"),
      pedido("aceptado", "ACCEPTED"), pedido("preparacion", "IN_PROGRESS"), pedido("entregado", "DELIVERED"), pedido("cancelado", "CANCELLED")]))
      .toEqual([nuevo]);
  });
  it("no repite un pedido visto en un refresco posterior", () => {
    const vistos = new Set<string>();
    const nuevos = detectarNuevos(vistos, [pedido("nuevo")]);
    nuevos.forEach((p) => vistos.add(p.id));
    expect(detectarNuevos(vistos, [pedido("nuevo")])).toEqual([]);
    expect(detectarNuevos(vistos, [])).toEqual([]);
    expect(detectarNuevos(vistos, [pedido("nuevo")])).toEqual([]);
  });
  it("deduplica la respuesta sin modificar el conjunto ni la lista de entrada", () => {
    const vistos = new Set(["anterior"]);
    const pedidos = [pedido("nuevo"), pedido("nuevo"), pedido("otro")];
    const original = structuredClone(pedidos);
    expect(detectarNuevos(vistos, pedidos).map((p) => p.id)).toEqual(["nuevo", "otro"]);
    expect(vistos).toEqual(new Set(["anterior"]));
    expect(pedidos).toEqual(original);
  });
});

describe("textoAntiguedad", () => {
  it.each([[0, "hace 0 min"], [3, "hace 3 min"], [59, "hace 59 min"], [60, "hace 1 h"],
    [120, "hace 2 h"], [1439, "hace 23 h"], [1440, "hace 1 d"], [25 * 60, "hace 1 d"],
    [3 * 1440, "hace 3 d"], [-5, "hace 0 min"], [NaN, "hace 0 min"], [Infinity, "hace 0 min"],
    [3.9, "hace 3 min"]] as const)("formatea %s como %s", (minutos, esperado) => {
    expect(textoAntiguedad(minutos)).toBe(esperado);
  });
});

const solicitudId = "d1430130-1111-4111-8111-000000000001";
const acceso = { estado: "VALIDO" as const, qrId: "qr-resuelto", modalidad: "DINE_IN" as const,
  restauranteId: "cevicheria", restauranteNombre: "Demo", localId: "local", localNombre: "Demo",
  mesa: { id: "mesa-resuelta", numero: 5 } };
const rpcAdmin = vi.fn();
const rpcMesero = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(crearClienteAdmin).mockReturnValue({ rpc: rpcAdmin } as unknown as ReturnType<typeof crearClienteAdmin>);
  vi.mocked(crearClienteServidor).mockResolvedValue({ rpc: rpcMesero } as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
  vi.mocked(requerirRol).mockResolvedValue({ usuario: { id: "mesero" }, membresias: [
    { restaurantId: "cevicheria", branchId: null, rol: "WAITER" },
  ] } as Awaited<ReturnType<typeof requerirRol>>);
});

describe("solicitar ayuda desde el QR", () => {
  it.each(["", "corto", "x".repeat(129), null, { mesaId: "mesa-falsa" }])("rechaza un token mal formado sin consultar ni llamar a la RPC: %s", async (token) => {
    expect(await solicitarAyudaAction(token as string)).toMatchObject({ ok: false });
    expect(resolverAccesoQr).not.toHaveBeenCalled();
    expect(rpcAdmin).not.toHaveBeenCalled();
  });
  it.each(["INVALIDO", "DESHABILITADO"] as const)("un QR %s no llama a la RPC", async (estado) => {
    vi.mocked(resolverAccesoQr).mockResolvedValue({ estado });
    expect(await solicitarAyudaAction("token-qr-valido")).toMatchObject({ ok: false });
    expect(rpcAdmin).not.toHaveBeenCalled();
  });
  it("solo usa el QR resuelto, aunque el navegador agregue mesa/restaurante falsos", async () => {
    rpcAdmin.mockResolvedValue({ data: solicitudId, error: null });
    const enviar = solicitarAyudaAction as (...args: unknown[]) => ReturnType<typeof solicitarAyudaAction>;
    expect(await enviar("token-qr-valido", { mesaId: "mesa-falsa", restauranteId: "polleria", qrId: "qr-falso" }))
      .toEqual({ ok: true, mensaje: "Listo, avisamos al mesero" });
    expect(resolverAccesoQr).toHaveBeenCalledExactlyOnceWith("token-qr-valido");
    expect(rpcAdmin).toHaveBeenCalledExactlyOnceWith("solicitar_ayuda", { p_qr_code_id: "qr-resuelto" });
    expect(crearClienteServidor).not.toHaveBeenCalled();
  });
  it("informa cuando una mesa se cerró después de abrir la carta", async () => {
    rpcAdmin.mockResolvedValue({ data: null, error: { code: "23514", message: "TABLE_NOT_OPEN" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await solicitarAyudaAction("token-qr-valido")).toMatchObject({ ok: false, codigo: "TABLE_NOT_OPEN", mensaje: expect.stringContaining("habilite la mesa") });
    } finally { log.mockRestore(); }
  });
  it("permite pedir ayuda en mostrador sin aceptar IDs de mesa", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue({ ...acceso, modalidad: "TAKEAWAY", mesa: null });
    rpcAdmin.mockResolvedValue({ data: solicitudId, error: null });
    expect(await solicitarAyudaAction("token-qr-valido")).toMatchObject({ ok: true });
    expect(rpcAdmin).toHaveBeenCalledWith("solicitar_ayuda", { p_qr_code_id: acceso.qrId });
  });
  it("oculta los detalles de una excepción de conexión", async () => {
    vi.mocked(resolverAccesoQr).mockRejectedValue(new Error("credencial privada de prueba"));
    const resultado = await solicitarAyudaAction("token-qr-valido");
    expect(resultado).toMatchObject({ ok: false, mensaje: expect.stringContaining("conexión") });
    expect(JSON.stringify(resultado)).not.toContain("privada");
    expect(rpcAdmin).not.toHaveBeenCalled();
  });
});

describe("atender una solicitud", () => {
  it("valida el identificador antes de consultar permisos o datos", async () => {
    expect(await atenderSolicitudAction("no-es-uuid")).toMatchObject({ ok: false });
    expect(requerirRol).not.toHaveBeenCalled();
    expect(rpcMesero).not.toHaveBeenCalled();
  });
  it("verifica rol, usa la sesión del mesero y revalida su panel", async () => {
    rpcMesero.mockResolvedValue({ error: null });
    expect(await atenderSolicitudAction(solicitudId)).toEqual({ ok: true, mensaje: "Solicitud atendida." });
    expect(requerirRol).toHaveBeenCalledExactlyOnceWith(["WAITER", "OWNER", "ADMIN"]);
    expect(rpcMesero).toHaveBeenCalledExactlyOnceWith("atender_solicitud_ayuda", { p_solicitud_id: solicitudId });
    expect(crearClienteAdmin).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/mesero");
  });
  it("no llama a la RPC si falla la autorización", async () => {
    vi.mocked(requerirRol).mockRejectedValue(new Error("Sin permiso"));
    await expect(atenderSolicitudAction(solicitudId)).rejects.toThrow("Sin permiso");
    expect(rpcMesero).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "ALREADY_ATTENDED", "REQUEST_NOT_FOUND"])("presenta el rechazo %s sin ocultarlo como éxito", async (codigo) => {
    rpcMesero.mockResolvedValue({ error: { code: "P0001", message: codigo } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const resultado = await atenderSolicitudAction(solicitudId);
      expect(resultado.ok).toBe(false);
      if (codigo === "ALREADY_ATTENDED") {
        expect(resultado).toMatchObject({ codigo });
        expect(revalidatePath).toHaveBeenCalledWith("/mesero");
      } else expect(revalidatePath).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe("consulta de solicitudes", () => {
  it("filtra por restaurante y OPEN, sin solicitar datos innecesarios", async () => {
    const q = { from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ data: [{ id: solicitudId, created_at: "2026-11-01T20:00:00Z", dining_tables: { number: 5 } }], error: null }) };
    vi.mocked(crearClienteServidor).mockResolvedValue(q as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
    expect(await listarSolicitudesAbiertas("cevicheria")).toEqual([{ id: solicitudId, creadaEn: "2026-11-01T20:00:00Z", mesaNumero: 5 }]);
    expect(q.from).toHaveBeenCalledWith("help_requests");
    expect(q.select).toHaveBeenCalledWith("id, created_at, dining_tables(number)");
    expect(q.eq).toHaveBeenCalledWith("restaurant_id", "cevicheria");
    expect(q.eq).toHaveBeenCalledWith("status", "OPEN");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
});
