import { describe, expect, it } from "vitest";
import { fechaActualLima, validarStockDiario } from "../../src/features/carta/validar-stock";

const productoA = "10000000-0000-0000-0000-000000000001";
const productoB = "10000000-0000-0000-0000-000000000002";

describe("validarStockDiario", () => {
  it("acepta cero, cantidades mayores a lo vendido y campos vacíos sin límite", () => {
    const conCantidad = validarStockDiario([
      { productoId: productoA, cantidad: "0" },
      { productoId: productoB, cantidad: "8" },
    ], new Map([[productoB, 3]]));
    expect(conCantidad.ok && conCantidad.items).toEqual([
      { productoId: productoA, cantidad: 0 },
      { productoId: productoB, cantidad: 8 },
    ]);
    const sinLimite = validarStockDiario([{ productoId: productoA, cantidad: "" }], new Map());
    expect(sinLimite.ok && sinLimite.items)
      .toEqual([{ productoId: productoA, cantidad: null }]);
  });

  it.each(["-1", "1.5", "1e2", " 2", "texto", "2147483648"])(
    "rechaza una cantidad inválida (%s)",
    (cantidad) => expect(validarStockDiario([{ productoId: productoA, cantidad }], new Map()))
      .toMatchObject({ ok: false }),
  );

  it("rechaza una cantidad menor a lo ya vendido hoy", () => {
    expect(validarStockDiario([{ productoId: productoA, cantidad: "4" }], new Map([[productoA, 5]])))
      .toMatchObject({ ok: false, mensaje: expect.stringContaining("vendidos") });
  });

  it("acepta exactamente lo ya vendido hoy", () => {
    expect(validarStockDiario([{ productoId: productoA, cantidad: "5" }], new Map([[productoA, 5]])))
      .toMatchObject({ ok: true, items: [{ productoId: productoA, cantidad: 5 }] });
  });

  it("impide quitar el límite después de registrar ventas hoy", () => {
    expect(validarStockDiario([{ productoId: productoA, cantidad: "" }], new Map([[productoA, 1]])))
      .toMatchObject({ ok: false, mensaje: expect.stringContaining("ventas") });
  });

  it("rechaza IDs inválidos y productos repetidos", () => {
    expect(validarStockDiario([{ productoId: "no-es-uuid", cantidad: "1" }], new Map()))
      .toMatchObject({ ok: false });
    expect(validarStockDiario([
      { productoId: productoA, cantidad: "1" },
      { productoId: productoA, cantidad: "2" },
    ], new Map())).toMatchObject({ ok: false });
  });
});

describe("fechaActualLima", () => {
  it("usa la fecha de Lima incluso cerca de la medianoche UTC", () => {
    expect(fechaActualLima(new Date("2026-11-10T03:30:00.000Z"))).toBe("2026-11-09");
    expect(fechaActualLima(new Date("2026-11-10T05:30:00.000Z"))).toBe("2026-11-10");
  });
});
