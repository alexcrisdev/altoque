import { describe, expect, it } from "vitest";
import {
  calcularCuenta,
  totalPedidoCentimos,
  type PagoCuenta,
  type PedidoCuenta,
} from "../../src/features/pago-cierre/cuenta-logica";

function pedido(parcial: Partial<PedidoCuenta> & Pick<PedidoCuenta, "id">): PedidoCuenta {
  return {
    numero: 1,
    estado: "PENDING",
    creadoEn: "2026-10-31T18:00:00Z",
    lineas: [{ nombre: "Ceviche", cantidad: 1, precioUnitarioCentimos: 3500, observacion: null }],
    ...parcial,
  };
}

function pago(parcial: Partial<PagoCuenta> & Pick<PagoCuenta, "id">): PagoCuenta {
  return { metodo: "CASH", estado: "CONFIRMED", montoCentimos: 1000, creadoEn: "2026-10-31T19:00:00Z", ...parcial };
}

describe("US-021: total de un pedido", () => {
  it("suma precio unitario por cantidad de cada línea", () => {
    const p = pedido({
      id: "a",
      lineas: [
        { nombre: "Ceviche", cantidad: 2, precioUnitarioCentimos: 3500, observacion: null },
        { nombre: "Chicha", cantidad: 3, precioUnitarioCentimos: 790, observacion: "sin hielo" },
      ],
    });
    expect(totalPedidoCentimos(p)).toBe(7000 + 2370);
  });

  it("un pedido sin líneas vale 0", () => {
    expect(totalPedidoCentimos(pedido({ id: "a", lineas: [] }))).toBe(0);
  });
});

describe("US-021: saldo de la cuenta", () => {
  it("sin pagos, el saldo es todo el consumo", () => {
    const cuenta = calcularCuenta([pedido({ id: "a" }), pedido({ id: "b", numero: 2 })], []);
    expect(cuenta.consumoCentimos).toBe(7000);
    expect(cuenta.pagadoCentimos).toBe(0);
    expect(cuenta.saldoCentimos).toBe(7000);
    expect(cuenta.puedeCerrar).toBe(false);
  });

  it("los pedidos cancelados se muestran pero no se cobran", () => {
    const cuenta = calcularCuenta([pedido({ id: "a" }), pedido({ id: "b", estado: "CANCELLED" })], []);
    expect(cuenta.pedidos.map((p) => p.id)).toEqual(["a"]);
    expect(cuenta.cancelados.map((p) => p.id)).toEqual(["b"]);
    expect(cuenta.consumoCentimos).toBe(3500);
  });

  it("solo los pagos confirmados bajan el saldo", () => {
    const cuenta = calcularCuenta(
      [pedido({ id: "a" })],
      [
        pago({ id: "p1", montoCentimos: 1000 }),
        pago({ id: "p2", estado: "PENDING", metodo: "YAPE", montoCentimos: 2500 }),
        pago({ id: "p3", estado: "FAILED", metodo: "CARD", montoCentimos: 2500 }),
      ],
    );
    expect(cuenta.pagadoCentimos).toBe(1000);
    expect(cuenta.saldoCentimos).toBe(2500);
    expect(cuenta.pagosNoVerificados.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(cuenta.puedeCerrar).toBe(false);
  });

  it("con el saldo pagado completo, se puede cerrar", () => {
    const cuenta = calcularCuenta([pedido({ id: "a" })], [pago({ id: "p1", montoCentimos: 3500 })]);
    expect(cuenta.saldoCentimos).toBe(0);
    expect(cuenta.puedeCerrar).toBe(true);
  });

  it("una mesa sin pedidos tiene saldo 0 y se puede cerrar", () => {
    const cuenta = calcularCuenta([], []);
    expect(cuenta.saldoCentimos).toBe(0);
    expect(cuenta.puedeCerrar).toBe(true);
  });

  it("si cancelan un pedido ya pagado, el saldo queda a favor (negativo) y no bloquea el cierre", () => {
    const cuenta = calcularCuenta(
      [pedido({ id: "a", estado: "CANCELLED" })],
      [pago({ id: "p1", montoCentimos: 3500 })],
    );
    expect(cuenta.saldoCentimos).toBe(-3500);
    expect(cuenta.puedeCerrar).toBe(true);
  });

  it("ordena los pedidos por llegada", () => {
    const cuenta = calcularCuenta(
      [
        pedido({ id: "tarde", creadoEn: "2026-10-31T20:00:00Z" }),
        pedido({ id: "temprano", creadoEn: "2026-10-31T18:00:00Z" }),
      ],
      [],
    );
    expect(cuenta.pedidos.map((p) => p.id)).toEqual(["temprano", "tarde"]);
  });

  it("no hay errores de decimales con muchos céntimos", () => {
    const lineas = Array.from({ length: 10 }, () => ({
      nombre: "Gaseosa",
      cantidad: 3,
      precioUnitarioCentimos: 10,
      observacion: null,
    }));
    const cuenta = calcularCuenta([pedido({ id: "a", lineas })], [pago({ id: "p1", montoCentimos: 100 })]);
    expect(cuenta.consumoCentimos).toBe(300);
    expect(cuenta.saldoCentimos).toBe(200);
  });
});
