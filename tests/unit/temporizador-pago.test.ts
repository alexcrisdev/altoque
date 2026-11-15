import { describe, expect, it } from "vitest";
import { calcularLimitePago, calcularTiempoRestante } from "../../src/features/pedidos/temporizador-pago";

describe("temporizador de pago US-097", () => {
  const creadoEn = "2026-11-15T12:00:00.000Z";

  it("calcula el límite en el servidor a 15 minutos de la creación", () => {
    expect(calcularLimitePago(creadoEn)).toBe("2026-11-15T12:15:00.000Z");
  });

  it("redondea el tiempo restante y marca el vencimiento al llegar a cero", () => {
    expect(calcularTiempoRestante("2026-11-15T12:15:00.000Z", Date.parse("2026-11-15T12:14:02.500Z")))
      .toEqual({ segundos: 58, vencido: false });
    expect(calcularTiempoRestante("2026-11-15T12:15:00.000Z", Date.parse("2026-11-15T12:15:00.000Z")))
      .toEqual({ segundos: 0, vencido: true });
  });
});
