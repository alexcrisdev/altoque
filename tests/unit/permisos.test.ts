import { describe, expect, it } from "vitest";
import { tieneAlgunoDeLosRoles, tienePermiso } from "../../src/features/auth/permisos";

describe("permisos por rol", () => {
  it("permite a cocina gestionar pedidos", () => {
    expect(tienePermiso("KITCHEN", "gestionar_pedidos")).toBe(true);
  });

  it("deniega a cocina registrar pagos", () => {
    expect(tienePermiso("KITCHEN", "registrar_pagos")).toBe(false);
  });

  it("permite entrar al panel solo con uno de los roles habilitados", () => {
    expect(tieneAlgunoDeLosRoles(["WAITER"], ["WAITER", "OWNER", "ADMIN"])).toBe(true);
    expect(tieneAlgunoDeLosRoles(["KITCHEN"], ["WAITER", "OWNER", "ADMIN"])).toBe(false);
  });
});
