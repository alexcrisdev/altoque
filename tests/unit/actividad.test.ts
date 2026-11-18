import { describe, expect, it } from "vitest";
import {
  calcularTiemposEtapas,
  construirActividad,
  filtrarActividad,
  formatoDuracion,
  mediana,
  personasDeActividad,
  type EventoEstadoPedido,
} from "../../src/features/dashboard/actividad-logica";

const min = (m: number) => new Date(Date.parse("2026-11-17T17:00:00Z") + m * 60_000).toISOString();
const ev = (order_id: string, from: string | null, to: string, m: number, event = "STATUS"): EventoEstadoPedido =>
  ({ order_id, from_status: from, to_status: to, event, created_at: min(m) });

describe("US-099 2b: mediana", () => {
  it("impar, par y vacío", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });
});

describe("US-099 2b: tiempos por etapa", () => {
  const eventos = [
    // A: QR con pago: espera 2, cocina 10, entrega 3, total 15.
    ev("A", null, "PENDING", 0), ev("A", "PENDING", "IN_PROGRESS", 2), ev("A", "IN_PROGRESS", "READY", 12),
    ev("A", "READY", "DELIVERED", 15),
    // B: del mesero (sin PENDING): cocina 20 con un Listo deshecho, entrega 5, total 25.
    ev("B", null, "IN_PROGRESS", 0), ev("B", "IN_PROGRESS", "READY", 8), ev("B", "READY", "IN_PROGRESS", 9),
    ev("B", "IN_PROGRESS", "READY", 20), ev("B", "READY", "DELIVERED", 25),
    // C: incompleto (no entregado): no cuenta.
    ev("C", null, "PENDING", 0), ev("C", "PENDING", "IN_PROGRESS", 1),
    // D: modificación (event MODIFIED) se ignora.
    ev("A", "IN_PROGRESS", "IN_PROGRESS", 5, "MODIFIED"),
  ];

  it("calcula promedio y mediana solo con pedidos completos", () => {
    const t = Object.fromEntries(calcularTiemposEtapas(eventos).map((x) => [x.etapa, x]));
    expect(t.PAGO).toEqual({ etapa: "PAGO", pedidos: 1, promedioMs: 2 * 60_000, medianaMs: 2 * 60_000 });
    expect(t.COCINA).toMatchObject({ pedidos: 2, promedioMs: 15 * 60_000, medianaMs: 15 * 60_000 });
    expect(t.ENTREGA).toMatchObject({ pedidos: 2, promedioMs: 4 * 60_000 });
    expect(t.TOTAL).toMatchObject({ pedidos: 2, promedioMs: 20 * 60_000, medianaMs: 20 * 60_000 });
  });

  it("un día sin pedidos completos devuelve ceros sin dividir entre cero", () => {
    expect(calcularTiemposEtapas([]).every((x) => x.pedidos === 0 && x.promedioMs === 0)).toBe(true);
  });

  it("formatea duraciones", () => {
    expect(formatoDuracion(45_000)).toBe("45 s");
    expect(formatoDuracion(12 * 60_000)).toBe("12 min");
    expect(formatoDuracion(65 * 60_000)).toBe("1 h 05 min");
    expect(formatoDuracion(-1)).toBe("—");
  });
});

describe("US-099 2b: registro de actividad", () => {
  const lista = construirActividad(
    [
      { id: "h1", from_status: null, to_status: "PENDING", event: "STATUS", reason: null, created_at: min(0), persona: null, numero: 10 },
      { id: "h2", from_status: "PENDING", to_status: "CANCELLED", event: "STATUS", reason: "Cliente se fue", created_at: min(5), persona: "Mesero Demo", numero: 10 },
    ],
    [
      { id: "p1", method: "YAPE", status: "FAILED", amount: 25, created_at: min(3), registradoPor: "Caja Demo", verificadoPor: null, cuenta: "Mesa 3" },
      { id: "p2", method: "CASH", status: "CONFIRMED", amount: "40.5", created_at: min(4), registradoPor: "Caja Demo", verificadoPor: "Caja Demo", cuenta: "Mesa 2" },
    ],
    [
      { id: "c1", kind: "EXCEPTION", reason: "Se fue sin pagar", balance: 12, closed_at: min(6), persona: "Admin Demo", cuenta: "Mesa 4" },
      { id: "c2", kind: "ORDINARY", reason: null, balance: 0, closed_at: min(7), persona: "Caja Demo", cuenta: "Para llevar N.º 9" },
    ],
  );

  it("ordena de lo más reciente a lo más antiguo y arma los textos", () => {
    expect(lista.map((a) => a.id)).toEqual(["c:c2", "c:c1", "h:h2", "p:p2", "p:p1", "h:h1"]);
    expect(lista.find((a) => a.id === "h:h1")).toMatchObject({ persona: "Cliente (QR)", que: "Pedido N.º 10 creado", resaltar: false });
    expect(lista.find((a) => a.id === "p:p2")).toMatchObject({
      que: "Pago confirmado · Efectivo S/ 40.50",
      detalle: "Mesa 2 · registrado por Caja Demo · verificado por Caja Demo",
    });
  });

  it("resalta cancelaciones, cierres con excepción y pagos rechazados", () => {
    expect(lista.filter((a) => a.resaltar).map((a) => a.id)).toEqual(["c:c1", "h:h2", "p:p1"]);
    expect(lista.find((a) => a.id === "h:h2")?.detalle).toBe("Cliente se fue");
    expect(lista.find((a) => a.id === "c:c1")?.detalle).toBe("Saldo S/ 12.00 · Se fue sin pagar");
  });

  it("filtra por tipo y por persona", () => {
    expect(filtrarActividad(lista, "PAGO", "TODAS").map((a) => a.id)).toEqual(["p:p2", "p:p1"]);
    expect(filtrarActividad(lista, "TODOS", "Caja Demo").map((a) => a.id)).toEqual(["c:c2", "p:p2", "p:p1"]);
    expect(filtrarActividad(lista, "CIERRE", "Mesero Demo")).toEqual([]);
    expect(personasDeActividad(lista)).toEqual(["Admin Demo", "Caja Demo", "Cliente (QR)", "Mesero Demo"]);
  });

  it("no incluye teléfonos, correos ni datos de tarjeta en los textos", () => {
    const texto = JSON.stringify(lista);
    expect(texto).not.toMatch(/@|\b9\d{8}\b|\b\d{13,19}\b/);
  });
});
