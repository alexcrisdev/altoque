import { describe, expect, it } from "vitest";
import { puedeGestionarIncidencias, puedeMarcarEntregado, validarIncidencia } from "../../src/features/pedidos/incidencias";
import type { EstadoPedido } from "../../src/features/pedidos/estados";
import type { Rol } from "../../src/features/auth/permisos";

describe("validación de incidencias", () => {
  it.each(["FALTANTE", "ERROR", "RECLAMO", "OTRO", "SIN_INGREDIENTES", "PROBLEMA_PREPARACION"])("acepta el tipo %s", (tipo) => {
    expect(validarIncidencia(tipo, "Producto equivocado")).toBeNull();
  });
  it("rechaza tipos desconocidos", () => {
    expect(validarIncidencia("OTRA", "Descripción válida")).not.toBeNull();
    expect(validarIncidencia("toString", "Descripción válida")).not.toBeNull();
  });
  it("rechaza descripciones vacías o de menos de 3 caracteres", () => {
    expect(validarIncidencia("ERROR", "  ")).not.toBeNull();
    expect(validarIncidencia("ERROR", "ab")).not.toBeNull();
  });
  it("acepta los límites de 3 y 300 caracteres", () => {
    expect(validarIncidencia("ERROR", "abc")).toBeNull();
    expect(validarIncidencia("ERROR", "x".repeat(300))).toBeNull();
  });
  it("rechaza descripciones mayores de 300 caracteres", () => {
    expect(validarIncidencia("ERROR", "x".repeat(301))).not.toBeNull();
  });
});

describe("puedeMarcarEntregado", () => {
  it.each<[EstadoPedido, boolean]>([
    ["PENDING", false], ["ACCEPTED", false], ["IN_PROGRESS", false],
    ["READY", true], ["DELIVERED", false], ["CANCELLED", false],
  ])("para %s devuelve %s", (estado, esperado) => {
    expect(puedeMarcarEntregado(estado)).toBe(esperado);
  });
});

describe("permisos de incidencias", () => {
  it.each<Rol>(["WAITER", "KITCHEN", "OWNER", "ADMIN"])("permite gestionar al rol %s", (rol) => {
    expect(puedeGestionarIncidencias([rol])).toBe(true);
  });
  it.each<Rol>(["CASHIER"])("no permite gestionar al rol %s", (rol) => {
    expect(puedeGestionarIncidencias([rol])).toBe(false);
  });
});
