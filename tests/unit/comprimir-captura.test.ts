import { afterEach, describe, expect, it, vi } from "vitest";
import { comprimirCaptura } from "../../src/features/pago-cierre/comprimir-captura";
afterEach(() => vi.unstubAllGlobals());
describe("US-102: recodificación de imágenes", () => {
  it("calcula la huella del original y recodifica reduciendo calidad hasta el tamaño objetivo", async () => {
    const close = vi.fn(), drawImage = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }));
    let intentos = 0;
    const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }),
      toBlob: vi.fn((fn: (b: Blob) => void) => fn(new Blob([new Uint8Array(++intentos === 1 ? 350000 : 200000)], { type: "image/jpeg" }))) };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    const original = new File(["imagen original con metadatos"], "foto.png", { type: "image/png" });
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await original.arrayBuffer())), b => b.toString(16).padStart(2,"0")).join("");
    const resultado = await comprimirCaptura(original);
    expect(resultado.huella).toBe(esperado); expect(resultado.imagen.size).toBe(200000);
    expect(resultado.imagen.type).toBe("image/jpeg"); expect(await resultado.imagen.text()).not.toContain("metadatos");
    expect(canvas.width).toBe(1280); expect(canvas.height).toBe(640);
    expect(canvas.toBlob).toHaveBeenNthCalledWith(1,expect.any(Function),"image/jpeg",0.9);
    expect(canvas.toBlob).toHaveBeenNthCalledWith(2,expect.any(Function),"image/jpeg",0.8);
    expect(close).toHaveBeenCalledOnce(); expect(drawImage).toHaveBeenCalledOnce();
  });
  it("rechaza un archivo no imagen antes de decodificar", async () => {
    const crear = vi.fn(); vi.stubGlobal("createImageBitmap",crear);
    await expect(comprimirCaptura(new File(["pdf"],"doc.pdf", { type: "application/pdf" }))).rejects.toThrow("imagen");
    expect(crear).not.toHaveBeenCalled();
  });
  it("explica el error si el navegador no puede decodificar", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported")));
    await expect(comprimirCaptura(new File(["heic"],"foto.heic", { type: "image/heic" }))).rejects.toThrow("JPEG o PNG");
  });
});
