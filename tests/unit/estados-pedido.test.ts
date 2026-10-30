import { describe, expect, it } from "vitest";
import { puedeCambiarEstado, requiereMotivo, type EstadoPedido } from "../../src/features/pedidos/estados";
import type { Rol } from "../../src/features/auth/permisos";

describe("transiciones de estado de pedido", () => {
  const validas: [EstadoPedido, EstadoPedido, Rol[]][] = [
    ["PENDING", "ACCEPTED", ["KITCHEN"]],
    ["ACCEPTED", "IN_PROGRESS", ["ADMIN"]],
    ["IN_PROGRESS", "READY", ["OWNER"]],
    ["READY", "DELIVERED", ["WAITER"]],
    ["PENDING", "CANCELLED", ["WAITER"]],
    ["ACCEPTED", "CANCELLED", ["ADMIN"]],
    ["IN_PROGRESS", "CANCELLED", ["OWNER"]],
  ];

  it.each(validas)("permite %s → %s para el rol correcto", (desde, hacia, roles) => {
    expect(puedeCambiarEstado(desde, hacia, roles)).toBe(true);
  });

  it.each(validas)("rechaza %s → %s si el rol no está permitido", (desde, hacia) => {
    expect(puedeCambiarEstado(desde, hacia, ["CASHIER"])).toBe(false);
  });

  it("rechaza transiciones inválidas y estados finales", () => {
    expect(puedeCambiarEstado("CANCELLED", "IN_PROGRESS", ["OWNER"])).toBe(false);
    expect(puedeCambiarEstado("DELIVERED", "CANCELLED", ["ADMIN"])).toBe(false);
    expect(puedeCambiarEstado("PENDING", "READY", ["KITCHEN"])).toBe(false);
  });

  it("exige motivo para cancelar", () => {
    expect(requiereMotivo("CANCELLED")).toBe(true);
    expect(requiereMotivo("READY")).toBe(false);
  });
});
