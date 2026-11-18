import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: vi.fn() }));
vi.mock("../../src/features/pago-cierre/pago-online", () => ({ resolverCuentaOnline: vi.fn() }));
vi.mock("../../src/features/pago-cierre/aviso-n8n", () => ({ programarAvisoPago: vi.fn() }));
vi.mock("../../src/features/pago-cierre/capturas", () => ({ guardarCaptura: vi.fn(), firmarCaptura: vi.fn(), listarCapturas: vi.fn(), limpiarCapturas: vi.fn(), titularBilletera: vi.fn(), totalBilleteraHoy: vi.fn(), verificarCaptura: vi.fn() }));
import { obtenerSesion } from "../../src/features/auth/sesion";
import { resolverCuentaOnline } from "../../src/features/pago-cierre/pago-online";
import { programarAvisoPago } from "../../src/features/pago-cierre/aviso-n8n";
import { guardarCaptura, firmarCaptura, listarCapturas, limpiarCapturas, titularBilletera, verificarCaptura } from "../../src/features/pago-cierre/capturas";
import { consultarCapturasAction, fotoCapturaAction, subirCapturaAction, verificarCapturaAction } from "../../src/features/pago-cierre/capturas-actions";
const restaurante = "10000000-0000-4000-8000-000000000001", id = "10000000-0000-4000-8000-000000000002";
function sesion(rol = "CASHIER", restaurantId = restaurante) {
  vi.mocked(obtenerSesion).mockResolvedValue({ usuario: { id: "usuario" }, membresias: [{ restaurantId, branchId: null, rol }] } as Awaited<ReturnType<typeof obtenerSesion>>);
}
let imagenValida: Uint8Array<ArrayBuffer>;
function formulario(bytes = imagenValida, tipo = "image/jpeg") {
  const f = new FormData();
  f.set("clave", id); f.set("wallet", "PLIN"); f.set("monto", "10.00"); f.set("huella", "a".repeat(64));
  f.set("imagen", new File([bytes], "captura.jpg", { type: tipo })); return f;
}
beforeEach(async () => {
  imagenValida = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).jpeg().toBuffer());
  vi.resetAllMocks(); sesion();
  vi.mocked(limpiarCapturas).mockResolvedValue(0);
  vi.mocked(listarCapturas).mockResolvedValue([{ id }] as Awaited<ReturnType<typeof listarCapturas>>);
  vi.mocked(resolverCuentaOnline).mockResolvedValue({ cuenta: { tipo: "MESA", id }, restauranteId: restaurante, restauranteNombre: "Demo", mesaNumero: 1, saldoCentimos: 1000 });
  vi.mocked(titularBilletera).mockResolvedValue("Titular Demo");
  vi.mocked(guardarCaptura).mockResolvedValue(id);
  vi.mocked(verificarCaptura).mockResolvedValue("pago");
});
describe("US-102: permisos y validación de capturas", () => {
  it.each(["WAITER", "KITCHEN"])("%s no recibe enlaces firmados", async rol => {
    sesion(rol); await expect(fotoCapturaAction(restaurante,id)).rejects.toThrow("permiso"); expect(firmarCaptura).not.toHaveBeenCalled();
  });
  it("no firma para otro restaurante", async () => {
    sesion("OWNER", id); await expect(fotoCapturaAction(restaurante,id)).rejects.toThrow(); expect(firmarCaptura).not.toHaveBeenCalled();
  });
  it.each(["CASHIER", "OWNER", "ADMIN"])("%s puede solicitar la foto de su restaurante", async rol => {
    sesion(rol); await fotoCapturaAction(restaurante,id); expect(firmarCaptura).toHaveBeenCalledWith(restaurante,id);
  });
  it("el mesero solo consulta pendientes, sin firmar ni borrar imágenes", async () => {
    sesion("WAITER"); await consultarCapturasAction(restaurante,true);
    expect(listarCapturas).toHaveBeenCalledWith(restaurante); expect(firmarCaptura).not.toHaveBeenCalled(); expect(limpiarCapturas).not.toHaveBeenCalled();
  });
  it("el cliente no confirma al subir", async () => {
    expect((await subirCapturaAction("token",null,formulario())).ok).toBe(true);
    expect(resolverCuentaOnline).toHaveBeenCalledWith("token",null);
    expect(guardarCaptura).toHaveBeenCalledWith(expect.objectContaining({ restauranteId: restaurante }), expect.objectContaining({ wallet: "PLIN", clave: id, monto: 1000 }));
    expect(verificarCaptura).not.toHaveBeenCalled(); expect(programarAvisoPago).not.toHaveBeenCalled();
  });
  it("rechaza QR inválido antes de subir", async () => {
    vi.mocked(resolverCuentaOnline).mockResolvedValue(null);
    expect((await subirCapturaAction("malo",null,formulario())).ok).toBe(false); expect(guardarCaptura).not.toHaveBeenCalled();
  });
  it("no ofrece carga sin titular", async () => {
    vi.mocked(titularBilletera).mockResolvedValue(null);
    expect((await subirCapturaAction("token",null,formulario())).ok).toBe(false); expect(guardarCaptura).not.toHaveBeenCalled();
  });
  it.each(["application/pdf", "image/svg+xml", "image/jpeg"])("rechaza contenido ajeno a imagen incluso con MIME %s", async tipo => {
    expect((await subirCapturaAction("token",null,formulario(new TextEncoder().encode("<svg/>"),tipo))).ok).toBe(false);
    expect(guardarCaptura).not.toHaveBeenCalled();
  });
  it("rechaza archivos mayores de 400 KB", async () => {
    expect((await subirCapturaAction("token",null,formulario(new Uint8Array(409601)))).ok).toBe(false); expect(guardarCaptura).not.toHaveBeenCalled();
  });
  it("No llegó no programa aviso de pago confirmado", async () => {
    expect((await verificarCapturaAction(restaurante,id,"NOT_RECEIVED",null,"No figura el ingreso")).ok).toBe(true);
    expect(verificarCaptura).toHaveBeenCalledWith(id,"NOT_RECEIVED",null,"No figura el ingreso"); expect(programarAvisoPago).not.toHaveBeenCalled();
  });
  it("otro monto se convierte a céntimos y el aviso solo lleva el ID del pago", async () => {
    expect((await verificarCapturaAction(restaurante,id,"OTHER","4.50")).ok).toBe(true);
    expect(verificarCaptura).toHaveBeenCalledWith(id,"OTHER",450,null); expect(programarAvisoPago).toHaveBeenCalledWith("pago");
  });
  it("no verifica una captura fuera de su restaurante", async () => {
    vi.mocked(listarCapturas).mockResolvedValue([]);
    expect((await verificarCapturaAction(restaurante,id,"COMPLETE",null)).ok).toBe(false); expect(verificarCaptura).not.toHaveBeenCalled();
  });
  it("un rechazo del RPC no genera aviso de confirmación", async () => {
    vi.mocked(verificarCaptura).mockRejectedValue(new Error("Ya verificado"));
    expect((await verificarCapturaAction(restaurante,id,"COMPLETE",null)).ok).toBe(false); expect(programarAvisoPago).not.toHaveBeenCalled();
  });
  it.each([null,"", "    ", "abc", "x".repeat(121)])("rechazo sin motivo válido (%s) no llega al RPC", async motivo => {
    expect((await verificarCapturaAction(restaurante,id,"NOT_RECEIVED",null,motivo)).ok).toBe(false);
    expect(verificarCaptura).not.toHaveBeenCalled();
  });
  it("no sube un archivo con cabecera JPEG falsificada", async () => {
    expect((await subirCapturaAction("token",null,formulario(new Uint8Array([255,216,255,224])))).ok).toBe(false);
    expect(guardarCaptura).not.toHaveBeenCalled();
  });
});
