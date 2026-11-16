import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { firmarCaptura, guardarCaptura, limpiarArchivosHuerfanos, limpiarCapturas, listarCapturas, verificarCaptura } from "../../src/features/pago-cierre/capturas";
import { ejecutarLimpiezaCapturas } from "../../src/features/pago-cierre/limpieza-capturas";

const cuenta = { cuenta: { tipo: "MESA" as const, id: "sesion" }, restauranteId: "restaurante", restauranteNombre: "Demo", mesaNumero: 1, saldoCentimos: 1000 };
const datos = { clave: "clave", wallet: "YAPE" as const, monto: 1000, huella: "a".repeat(64), imagen: new Uint8Array([255,216,255]), tipo: "image/jpeg" };
function cliente() {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), then: vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  const storage = { list: vi.fn().mockResolvedValue({ data: [], error: null }), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }), createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "url-privada" }, error: null }) };
  const db = { from: vi.fn(() => q), rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "error", code: "P0001" } }), storage: { from: vi.fn(() => storage) } };
  vi.mocked(crearClienteAdmin).mockReturnValue(db as unknown as ReturnType<typeof crearClienteAdmin>);
  return { db, q, storage };
}
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("US-102: consultas privadas, reintentos y eliminación", () => {
  it("envía el motivo al RPC usando la sesión autenticada", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "pago", error: null });
    vi.mocked(crearClienteServidor).mockResolvedValue({ rpc } as never);
    await verificarCaptura("captura","NOT_RECEIVED",null,"No figura el ingreso");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("verificar_pago_captura", {
      p_captura_id: "captura", p_resultado: "NOT_RECEIVED", p_monto_recibido: null, p_motivo: "No figura el ingreso",
    });
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
  it("explica el bloqueo de una imagen ya confirmada", async () => {
    vi.mocked(crearClienteServidor).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "PROOF_ALREADY_USED" } }) } as never);
    await expect(verificarCaptura("captura","COMPLETE",null)).rejects.toThrow("ya respaldó otro pago confirmado");
  });
  it("compensa el archivo si falla el registro y no existe comprobante", async () => {
    const { storage } = cliente(); await expect(guardarCaptura(cuenta,datos)).rejects.toThrow("registrar");
    expect(storage.remove).toHaveBeenCalledWith([expect.stringMatching(/^restaurante\/.+\.jpg$/)]);
  });
  it("no elimina una foto si se perdió la respuesta de un registro exitoso", async () => {
    const { storage, q } = cliente(); q.maybeSingle.mockResolvedValue({ data: { id: "registrada" }, error: null } as never);
    await expect(guardarCaptura(cuenta,datos)).rejects.toThrow(); expect(storage.remove).not.toHaveBeenCalled();
  });
  it("no borra durante un timeout aunque la transacción aún no sea visible", async () => {
    const { storage, db } = cliente(); db.rpc.mockResolvedValue({ data: null, error: { message: "timeout", code: "" } });
    await expect(guardarCaptura(cuenta,datos)).rejects.toThrow(); expect(storage.remove).not.toHaveBeenCalled();
  });
  it("un reintento elimina solo la subida nueva, preservando la original", async () => {
    const { storage, db } = cliente(); db.rpc.mockResolvedValue({ data: [{ captura_id: "id", ruta_guardada: "restaurante/original.jpg" }], error: null } as never);
    expect(await guardarCaptura(cuenta,datos)).toBe("id");
    expect(storage.remove).toHaveBeenCalledOnce(); expect(storage.remove.mock.calls[0][0]).not.toContain("restaurante/original.jpg");
  });
  it("firma solo la fila del restaurante indicado y por 60 segundos", async () => {
    const { q, storage } = cliente(); q.maybeSingle.mockResolvedValue({ data: { storage_path: "ruta", created_at: new Date().toISOString() }, error: null } as never);
    expect(await firmarCaptura("restaurante","captura")).toBe("url-privada");
    expect(q.eq).toHaveBeenCalledWith("restaurant_id","restaurante"); expect(q.eq).toHaveBeenCalledWith("id","captura");
    expect(storage.createSignedUrl).toHaveBeenCalledWith("ruta",60);
  });
  it("no firma imágenes vencidas", async () => {
    const { q, storage } = cliente(); q.maybeSingle.mockResolvedValue({ data: { storage_path: "ruta", created_at: "2020-01-01" }, error: null } as never);
    expect(await firmarCaptura("restaurante","captura")).toBeNull(); expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
  it("si falla Storage, no marca la imagen como eliminada", async () => {
    const { q, storage } = cliente();
    q.then.mockImplementation(resolve => Promise.resolve({ data: [{ id: "captura", storage_path: "ruta", created_at: "2020-01-01", restaurant_id: "restaurante" }], error: null }).then(resolve));
    storage.remove.mockResolvedValue({ error: { message: "fallo" } } as never);
    await expect(limpiarCapturas("restaurante")).rejects.toThrow("eliminar"); expect(q.update).not.toHaveBeenCalled();
  });
  it("elimina al cerrar aunque no hayan pasado 24 horas", async () => {
    const { q, storage } = cliente();
    q.then.mockImplementation(resolve => Promise.resolve({ data: [{ id: "captura", storage_path: "ruta", created_at: new Date().toISOString(), restaurant_id: "restaurante", table_session_id: "sesion" }], error: null }).then(resolve));
    q.maybeSingle.mockResolvedValue({ data: { id: "cierre" }, error: null } as never);
    expect(await limpiarCapturas("restaurante")).toBe(1);
    expect(storage.remove).toHaveBeenCalledWith(["ruta"]); expect(q.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
  });
  it("pagina los pendientes de 500 en 500 y no devuelve rutas de Storage", async () => {
    const fila = { id: "id", wallet: "YAPE", expected_amount: "10", declared_amount: "8", created_at: "fecha", duplicate: false, deleted_at: null, table_sessions: { dining_tables: { number: 5 } }, orders: null };
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValueOnce({ data: Array(500).fill(fila), error: null }).mockResolvedValueOnce({ data: [fila], error: null }) };
    vi.mocked(crearClienteServidor).mockResolvedValue({ from: () => q } as never);
    const resultado = await listarCapturas("restaurante"); expect(resultado).toHaveLength(501);
    expect(q.range.mock.calls).toEqual([[0,499],[500,999]]); expect(q.eq).toHaveBeenCalledWith("restaurant_id","restaurante");
    expect(resultado[0]).toMatchObject({ titulo: "Mesa 5", esperado: 1000, declarado: 800 }); expect(resultado[0]).not.toHaveProperty("storage_path");
  });
  it("el trabajo programado rechaza solicitudes sin secreto", async () => {
    vi.stubEnv("CAPTURAS_CRON_SECRET","s".repeat(32));
    expect((await ejecutarLimpiezaCapturas(null)).estado).toBe(401); expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
  it("el barrido solo elimina huérfanos antiguos, conservando archivos recientes o registrados", async () => {
    const { q, storage } = cliente(); const restaurante = "10000000-0000-4000-8000-000000000001";
    storage.list.mockResolvedValueOnce({ data: [{ name: restaurante }], error: null }).mockResolvedValueOnce({ data: [
      { name: "huerfana.jpg", created_at: "2020-01-01" }, { name: "registrada.jpg", created_at: "2020-01-01" },
      { name: "reciente.jpg", created_at: new Date().toISOString() },
    ], error: null });
    q.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { id: "captura" }, error: null } as never);
    expect(await limpiarArchivosHuerfanos()).toBe(1);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith([`${restaurante}/huerfana.jpg`]);
  });
});
