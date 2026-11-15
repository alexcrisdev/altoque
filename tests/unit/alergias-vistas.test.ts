import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/cocina/kds-actions", () => ({ obtenerKds: vi.fn(), cambiarEstadoKds: vi.fn() }));
vi.mock("../../src/features/cocina/reportar-incidencia", () => ({ ReportarIncidencia: () => null, MarcarIncidenciaResuelta: () => null }));
vi.mock("../../src/features/pago-cierre/verificar-pago", () => ({ VerificarPago: () => null }));
import { TableroKds } from "../../src/features/cocina/tablero-kds";
import { DetalleCuenta } from "../../src/features/pago-cierre/detalle-cuenta";
import { calcularCuenta } from "../../src/features/pago-cierre/cuenta-logica";
import type { PedidoCocina } from "../../src/features/cocina/tipos";

const ahora = Date.parse("2026-11-15T17:00:00Z");
const pedido: PedidoCocina = { id: "p1", numero: 91, creadoEn: new Date(ahora).toISOString(), estado: "IN_PROGRESS",
  modalidad: "DINE_IN", asistido: false, mesaNumero: 3, nombreCliente: null,
  alergia: { respuesta: "YES", alergenos: ["MANI"], detalle: "Evitar contacto" },
  items: [{ nombre: "Plato", cantidad: 1, observacion: null, alergenos: ["Pescado"] }], incidenciasAbiertas: [] };

describe("US-091: avisos visibles al personal", () => {
  it.each([true, false])("KDS muestra la declaración separada del producto (TV %s)", tv => {
    const html = renderToStaticMarkup(createElement(TableroKds, { inicial: { ok: true, restauranteId: "r1", pedidos: [pedido], actualizadoEn: ahora }, tv }));
    expect(html).toContain("Alergia: Maní — Evitar contacto");
    expect(html).toContain("Pescado");
    expect(html).toContain("text-peligro-texto");
    expect(html).toContain("⚠");
  });
  it("caja conserva el aviso al calcular la cuenta", () => {
    const cuenta = calcularCuenta([{ id: pedido.id, numero: 91, estado: "IN_PROGRESS", creadoEn: pedido.creadoEn,
      alergia: pedido.alergia, lineas: [{ nombre: "Plato", cantidad: 1, precioUnitarioCentimos: 1000, observacion: null }] }], []);
    const html = renderToStaticMarkup(createElement(DetalleCuenta, { cuenta }));
    expect(html).toContain("Alergia: Maní — Evitar contacto");
    expect(html).toContain("text-peligro-texto");
  });
});
