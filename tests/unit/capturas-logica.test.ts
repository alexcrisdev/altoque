import { afterEach, describe, expect, it, vi } from "vitest";
import { dimensionesCaptura, inicioDiaLima, programarConfirmacion, requiereAvisoCaptura, tiempoCaptura, tipoImagen } from "../../src/features/pago-cierre/capturas-logica";

afterEach(() => vi.useRealTimers());
describe("US-102: imágenes, alertas y deshacer", () => {
  it.each([[4000, 2000, 1280, 640], [1000, 3000, 427, 1280], [400, 300, 400, 300]])("reduce %sx%s sin ampliar", (a,b,x,y) => {
    expect(dimensionesCaptura(a,b)).toEqual({ ancho: x, alto: y });
  });
  it.each([0, -1, NaN, Infinity])("rechaza dimensiones inválidas: %s", n => expect(() => dimensionesCaptura(n, 20)).toThrow());
  it("reconoce JPEG por bytes", () => expect(tipoImagen(new Uint8Array([255,216,255,224]))).toBe("image/jpeg"));
  it("reconoce WebP por bytes", () => expect(tipoImagen(new TextEncoder().encode("RIFF1234WEBP"))).toBe("image/webp"));
  it.each(["<svg/>", "%PDF", "RIFF1234WAVE", ""])("rechaza %s", contenido => expect(tipoImagen(new TextEncoder().encode(contenido))).toBeNull());
  it("avisa desde los tres minutos exactos", () => {
    const fecha = "2026-11-15T15:00:00Z", inicio = Date.parse(fecha);
    expect(requiereAvisoCaptura(fecha, inicio + 179999)).toBe(false);
    expect(requiereAvisoCaptura(fecha, inicio + 180000)).toBe(true);
    expect(tiempoCaptura(fecha, inicio + 181000)).toBe("03:01");
  });
  it("no presenta tiempos negativos", () => expect(tiempoCaptura("2026-11-15", 0)).toBe("00:00"));
  it("solo confirma una vez después de diez segundos", () => {
    vi.useFakeTimers(); const confirmar = vi.fn(); programarConfirmacion(confirmar);
    vi.advanceTimersByTime(9999); expect(confirmar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(confirmar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20000); expect(confirmar).toHaveBeenCalledTimes(1);
  });
  it("Deshacer cancela la escritura", () => {
    vi.useFakeTimers(); const confirmar = vi.fn(); const cancelar = programarConfirmacion(confirmar);
    vi.advanceTimersByTime(9000); cancelar(); vi.advanceTimersByTime(30000);
    expect(confirmar).not.toHaveBeenCalled();
  });
  it("el total del día usa Lima y no UTC", () => {
    expect(inicioDiaLima(new Date("2026-11-16T04:59:59Z"))).toBe("2026-11-15T05:00:00.000Z");
    expect(inicioDiaLima(new Date("2026-11-16T05:00:00Z"))).toBe("2026-11-16T05:00:00.000Z");
  });
});
