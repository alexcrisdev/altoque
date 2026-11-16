import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { validarImagenCaptura } from "../../src/features/pago-cierre/validar-imagen-captura";
import { motivoRechazoCaptura } from "../../src/features/pago-cierre/capturas-logica";

describe("US-102: decodificación real del archivo en servidor", () => {
  const crear = () => sharp({ create: { width: 32, height: 16, channels: 3, background: "white" } });
  it.each(["jpeg", "webp"] as const)("acepta %s real, lo convierte a JPEG y quita metadatos", async formato => {
    const entrada = await crear().withMetadata({ orientation: 6 }).toFormat(formato).toBuffer();
    const salida = await validarImagenCaptura(entrada, `image/${formato}`);
    const datos = await sharp(salida).metadata();
    expect(datos.format).toBe("jpeg"); expect(datos.exif).toBeUndefined(); expect(datos.orientation).toBeUndefined();
    expect(datos.width).toBe(16); expect(datos.height).toBe(32);
  });
  it("rechaza MIME que no coincide con el archivo", async () => {
    await expect(validarImagenCaptura(await crear().webp().toBuffer(),"image/jpeg")).rejects.toThrow();
  });
  it("rechaza un JPEG truncado aunque conserve su cabecera", async () => {
    const entrada = await crear().jpeg().toBuffer();
    await expect(validarImagenCaptura(entrada.subarray(0,Math.floor(entrada.length / 2)),"image/jpeg")).rejects.toThrow();
  });
  it("descarta contenido agregado al final antes de almacenar", async () => {
    const entrada = Buffer.concat([await crear().jpeg().toBuffer(),Buffer.from("<script>contenido-ajeno</script>")]);
    const salida = await validarImagenCaptura(entrada,"image/jpeg");
    expect(Buffer.from(salida).includes(Buffer.from("contenido-ajeno"))).toBe(false);
  });
  it("rechaza imágenes con más de 1280 píxeles de lado", async () => {
    const entrada = await sharp({ create: { width: 1281, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(validarImagenCaptura(entrada,"image/jpeg")).rejects.toThrow();
  });
  it("normaliza el motivo y rechaza caracteres de control", () => {
    expect(motivoRechazoCaptura("  No figura el ingreso  ")).toBe("No figura el ingreso");
    expect(motivoRechazoCaptura("Motivo\ncon salto")).toBeNull();
    expect(motivoRechazoCaptura("x".repeat(120))).not.toBeNull();
  });
});
