import { describe, expect, it } from "vitest";
import { detectarNuevos, textoAntiguedad } from "../../src/features/mesero/alertas-logica";
import type { EstadoPedido } from "../../src/features/pedidos/estados";

const pedido = (id: string, estado: EstadoPedido = "PENDING") => ({ id, estado, numero: 31 });

describe("detectarNuevos", () => {
  it("no avisa con los pedidos anteriores de la primera carga", () => {
    expect(detectarNuevos(null, [pedido("viejo")])).toEqual([]);
  });
  it("devuelve únicamente los PENDING que no se habían visto", () => {
    const nuevo = pedido("nuevo");
    expect(detectarNuevos(new Set(["viejo"]), [pedido("viejo"), nuevo, pedido("listo", "READY"),
      pedido("aceptado", "ACCEPTED"), pedido("preparacion", "IN_PROGRESS"), pedido("entregado", "DELIVERED"), pedido("cancelado", "CANCELLED")]))
      .toEqual([nuevo]);
  });
  it("no repite un pedido visto en un refresco posterior", () => {
    const vistos = new Set<string>();
    const nuevos = detectarNuevos(vistos, [pedido("nuevo")]);
    nuevos.forEach((p) => vistos.add(p.id));
    expect(detectarNuevos(vistos, [pedido("nuevo")])).toEqual([]);
    expect(detectarNuevos(vistos, [])).toEqual([]);
    expect(detectarNuevos(vistos, [pedido("nuevo")])).toEqual([]);
  });
  it("deduplica la respuesta sin modificar el conjunto ni la lista de entrada", () => {
    const vistos = new Set(["anterior"]);
    const pedidos = [pedido("nuevo"), pedido("nuevo"), pedido("otro")];
    const original = structuredClone(pedidos);
    expect(detectarNuevos(vistos, pedidos).map((p) => p.id)).toEqual(["nuevo", "otro"]);
    expect(vistos).toEqual(new Set(["anterior"]));
    expect(pedidos).toEqual(original);
  });
});

describe("textoAntiguedad", () => {
  it.each([[0, "hace 0 min"], [3, "hace 3 min"], [59, "hace 59 min"], [60, "hace 1 h"],
    [120, "hace 2 h"], [1439, "hace 23 h"], [1440, "hace 1 d"], [25 * 60, "hace 1 d"],
    [3 * 1440, "hace 3 d"], [-5, "hace 0 min"], [NaN, "hace 0 min"], [Infinity, "hace 0 min"],
    [3.9, "hace 3 min"]] as const)("formatea %s como %s", (minutos, esperado) => {
    expect(textoAntiguedad(minutos)).toBe(esperado);
  });
});
