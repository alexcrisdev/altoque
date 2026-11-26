import { describe, expect, it } from "vitest";
import {
  panelDeRuta,
  panelesDisponibles,
  puedeEntrar,
  rutaInicial,
  tieneAlgunoDeLosRoles,
  type Panel,
  type Rol,
} from "../../src/features/auth/permisos";

// US-106: matriz de 4 paneles × 5 roles. Solo el rol del panel entra.
const esperado: Record<Rol, Panel[]> = {
  OWNER: ["admin"],
  ADMIN: ["admin"],
  WAITER: ["mesero"],
  KITCHEN: ["cocina"],
  CASHIER: ["caja"],
};

describe("US-106: paneles por rol", () => {
  for (const [rol, paneles] of Object.entries(esperado) as [Rol, Panel[]][]) {
    for (const panel of ["admin", "mesero", "cocina", "caja"] as Panel[]) {
      const entra = paneles.includes(panel);
      it(`${rol} ${entra ? "entra" : "no entra"} a /${panel}`, () => {
        expect(puedeEntrar([rol], panel)).toBe(entra);
      });
    }
  }

  it("dueño y admin no operan mesero, cocina ni caja", () => {
    expect(panelesDisponibles(["OWNER", "ADMIN"])).toEqual(["admin"]);
  });

  it("quien cubre dos puestos ve solo sus dos paneles", () => {
    expect(panelesDisponibles(["CASHIER", "WAITER"])).toEqual(["mesero", "caja"]);
  });

  it("cada cuenta llega a su panel al iniciar sesión", () => {
    expect(rutaInicial(["OWNER"])).toBe("/admin");
    expect(rutaInicial(["WAITER"])).toBe("/mesero");
    expect(rutaInicial(["KITCHEN"])).toBe("/cocina");
    expect(rutaInicial(["CASHIER"])).toBe("/caja");
    expect(rutaInicial([])).toBe("/sin-acceso");
  });

  it("reconoce el panel de cada ruta", () => {
    expect(panelDeRuta("/caja/mesa/123")).toBe("caja");
    expect(panelDeRuta("/admin")).toBe("admin");
    expect(panelDeRuta("/cajas")).toBeNull();
    expect(panelDeRuta("/m/token")).toBeNull();
  });

  it("permite entrar solo con uno de los roles habilitados", () => {
    expect(tieneAlgunoDeLosRoles(["WAITER"], ["WAITER"])).toBe(true);
    expect(tieneAlgunoDeLosRoles(["KITCHEN"], ["WAITER"])).toBe(false);
  });
});
