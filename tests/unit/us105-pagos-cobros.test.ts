import { describe, expect, it, vi } from "vitest";
import { mensajeErrorEstado, puedeCancelarPedido } from "../../src/features/pedidos/estados";
import { esPagoPropio, mensajeErrorPago, puedeVerificarPagoAjeno, puedeVerificarPagos } from "../../src/features/pago-cierre/pago-logica";
import { excedenteCaptura } from "../../src/features/pago-cierre/capturas-logica";
import { mensajeErrorDevolucion, puedeMarcarDevolucion } from "../../src/features/pago-cierre/devoluciones-logica";
import { etiquetaNumeroDia, fechaCortaPedido } from "../../src/features/pedidos/numero-dia";
import { restarDevoluciones } from "../../src/features/dashboard/ventas";
import { calcularResumenVentas } from "../../src/features/dashboard/ventas-logica";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));

// US-105: lógica de la app que acompaña a la migración (la regla final la impone la base;
// ver tests/rls/us105-pagos-cobros.test.ts).

describe("US-105: cancelación por rol", () => {
  it("sin pago confirmado, el mesero puede cancelar un pedido por confirmar", () => {
    expect(puedeCancelarPedido("PENDING", ["WAITER"], false)).toBe(true);
  });

  it("con pago confirmado, el mesero ya no ve la opción de cancelar", () => {
    expect(puedeCancelarPedido("PENDING", ["WAITER"], true)).toBe(false);
    expect(puedeCancelarPedido("IN_PROGRESS", ["WAITER"], true)).toBe(false);
  });

  it.each(["OWNER", "ADMIN"] as const)("con pago confirmado, %s sí puede cancelar (con motivo)", (rol) => {
    expect(puedeCancelarPedido("IN_PROGRESS", [rol], true)).toBe(true);
  });

  it("un pedido entregado o ya cancelado no se cancela, esté o no pagado", () => {
    expect(puedeCancelarPedido("DELIVERED", ["OWNER"], true)).toBe(false);
    expect(puedeCancelarPedido("CANCELLED", ["ADMIN"], false)).toBe(false);
  });

  it("el error de la base se traduce a un mensaje claro", () => {
    expect(mensajeErrorEstado("PAID_ORDER_ADMIN_ONLY")).toContain("solo el dueño o el admin");
  });
});

describe("US-105: verificación por otra persona", () => {
  it("caja, dueño y admin verifican pagos ajenos; mesero y cocina no", () => {
    expect(puedeVerificarPagoAjeno(["CASHIER"])).toBe(true);
    expect(puedeVerificarPagoAjeno(["OWNER"])).toBe(true);
    expect(puedeVerificarPagoAjeno(["ADMIN"])).toBe(true);
    expect(puedeVerificarPagoAjeno(["WAITER"])).toBe(false);
    expect(puedeVerificarPagoAjeno(["KITCHEN"])).toBe(false);
  });

  it("el panel de caja sigue siendo solo de caja", () => {
    expect(puedeVerificarPagos(["OWNER"])).toBe(false);
    expect(puedeVerificarPagos(["CASHIER"])).toBe(true);
  });

  it("detecta el pago propio y no confunde datos faltantes con propio", () => {
    expect(esPagoPropio("usuario-1", "usuario-1")).toBe(true);
    expect(esPagoPropio("usuario-1", "usuario-2")).toBe(false);
    expect(esPagoPropio(null, "usuario-1")).toBe(false);
    expect(esPagoPropio(null, undefined)).toBe(false);
  });

  it("el rechazo de la base se explica en español", () => {
    expect(mensajeErrorPago("SELF_VERIFICATION")).toContain("registraste tú");
  });
});

describe("US-105: excedente visible antes de confirmar", () => {
  it("avisa cuánto supera lo declarado al saldo actual", () => {
    expect(excedenteCaptura({ declarado: 5000, saldoActual: 3000 })).toBe(2000);
  });

  it("si la cuenta ya está pagada, todo lo declarado es excedente", () => {
    expect(excedenteCaptura({ declarado: 2500, saldoActual: 0 })).toBe(2500);
    expect(excedenteCaptura({ declarado: 2500, saldoActual: -500 })).toBe(2500);
  });

  it("no avisa si cubre justo o menos, ni si no se pudo consultar el saldo", () => {
    expect(excedenteCaptura({ declarado: 3000, saldoActual: 3000 })).toBe(0);
    expect(excedenteCaptura({ declarado: 1000, saldoActual: 3000 })).toBe(0);
    expect(excedenteCaptura({ declarado: 1000, saldoActual: null })).toBe(0);
    expect(excedenteCaptura({ declarado: 1000 })).toBe(0);
  });
});

describe("US-105: devoluciones", () => {
  it("caja, dueño y admin marcan la devolución; mesero no", () => {
    expect(puedeMarcarDevolucion(["CASHIER"])).toBe(true);
    expect(puedeMarcarDevolucion(["OWNER"])).toBe(true);
    expect(puedeMarcarDevolucion(["ADMIN"])).toBe(true);
    expect(puedeMarcarDevolucion(["WAITER"])).toBe(false);
  });

  it("explica una devolución ya hecha por otra persona", () => {
    expect(mensajeErrorDevolucion("ALREADY_REFUNDED")).toContain("ya marcó");
    expect(mensajeErrorDevolucion("cualquier-otro")).toContain("No se pudo");
  });

  it("restar devoluciones baja las ventas y recalcula el ticket, sin tocar el desglose", () => {
    const resumen = calcularResumenVentas([
      { table_session_id: "mesa-1", order_id: null, method: "CASH", status: "CONFIRMED", amount: "30.00" },
      { table_session_id: "mesa-2", order_id: null, method: "YAPE", status: "CONFIRMED", amount: "10.00" },
    ]);
    const neto = restarDevoluciones(resumen, 1000);
    expect(neto.ventasCentimos).toBe(3000);
    expect(neto.ticketPromedioCentimos).toBe(1500);
    expect(neto.porMetodo).toEqual(resumen.porMetodo);
  });

  it("nunca deja ventas negativas y no cambia nada sin devoluciones", () => {
    const resumen = calcularResumenVentas([
      { table_session_id: "mesa-1", order_id: null, method: "CASH", status: "CONFIRMED", amount: "10.00" },
    ]);
    expect(restarDevoluciones(resumen, 5000).ventasCentimos).toBe(0);
    expect(restarDevoluciones(resumen, 0)).toBe(resumen);
  });
});

describe("US-105: número del día con su fecha", () => {
  it("muestra número y fecha corta (día/mes)", () => {
    expect(etiquetaNumeroDia(5, "2026-11-26")).toBe("N.º 5 · 26/11");
    expect(fechaCortaPedido("2026-01-03")).toBe("03/01");
  });

  it("sin fecha válida muestra solo el número", () => {
    expect(etiquetaNumeroDia(5, null)).toBe("N.º 5");
    expect(etiquetaNumeroDia(5, "26/11/2026")).toBe("N.º 5");
  });
});
