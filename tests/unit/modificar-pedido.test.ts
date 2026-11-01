import { describe, expect, it } from "vitest";
import { calcularNuevoTotalCentimos, puedeModificar, requiereMotivoModificacion, validarCambios, type ItemModificable } from "../../src/features/pedidos/modificacion";
import type { EstadoPedido } from "../../src/features/pedidos/estados";
import type { Rol } from "../../src/features/auth/permisos";

const itemId = "11111111-1111-4111-8111-111111111111";
const otroId = "22222222-2222-4222-8222-222222222222";
const items: ItemModificable[] = [
  { id: itemId, nombre: "Ceviche", cantidad: 2, precioUnitarioCentimos: 2500, observacion: null },
  { id: otroId, nombre: "Chicha morada", cantidad: 1, precioUnitarioCentimos: 500, observacion: null },
];

describe("modificación de pedidos", () => {
  it.each<[EstadoPedido, Rol[], boolean]>([
    ["PENDING", ["WAITER"], true], ["PENDING", ["OWNER"], true], ["PENDING", ["ADMIN"], true], ["PENDING", ["KITCHEN"], false],
    ["ACCEPTED", ["WAITER"], true], ["ACCEPTED", ["OWNER"], true], ["ACCEPTED", ["ADMIN"], true], ["ACCEPTED", ["CASHIER"], false],
    ["IN_PROGRESS", ["WAITER"], false], ["IN_PROGRESS", ["OWNER"], true], ["IN_PROGRESS", ["ADMIN"], true], ["IN_PROGRESS", ["KITCHEN"], false],
    ["READY", ["ADMIN"], false], ["DELIVERED", ["OWNER"], false], ["CANCELLED", ["ADMIN"], false],
  ])("permiso %s / %s = %s", (estado, roles, esperado) => expect(puedeModificar(estado, roles)).toBe(esperado));

  it("exige motivo solo en preparación", () => {
    expect(requiereMotivoModificacion("IN_PROGRESS")).toBe(true);
    expect(requiereMotivoModificacion("PENDING")).toBe(false);
  });

  it("rechaza quitar todos y un producto ajeno", () => {
    expect(validarCambios(items, [{ itemId, cantidad: 0 }, { itemId: otroId, cantidad: 0 }])).toEqual({ ok: false, codigo: "ORDER_EMPTY" });
    expect(validarCambios(items, [{ itemId: "33333333-3333-4333-8333-333333333333", cantidad: 1 }])).toEqual({ ok: false, codigo: "INVALID_CHANGES" });
  });

  it.each([0, 1, 20])("acepta cantidad %i", (cantidad) => {
    const cambio = [{ itemId, cantidad }];
    expect(validarCambios(items, cambio).ok).toBe(true);
  });

  it("rechaza cantidad 21 y observaciones largas", () => {
    expect(validarCambios(items, [{ itemId, cantidad: 21 }])).toEqual({ ok: false, codigo: "INVALID_CHANGES" });
    expect(validarCambios(items, [{ itemId, cantidad: 1, observacion: "x".repeat(141) }])).toEqual({ ok: false, codigo: "INVALID_CHANGES" });
  });

  it("recalcula el total en céntimos y conserva líneas sin cambios", () => {
    expect(calcularNuevoTotalCentimos(items, [{ itemId, cantidad: 1 }])).toBe(3000);
    expect(calcularNuevoTotalCentimos(items, [{ itemId, cantidad: 20 }])).toBe(50500);
  });
});
