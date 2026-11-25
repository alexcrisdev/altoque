import { describe, expect, it } from "vitest";
import { estadoLiberacion, TEXTO_LIBERACION } from "../../src/features/mesero/liberacion-logica";
import { evaluarCierreAdmin } from "../../src/features/pago-cierre/cierre-logica";
import { calcularCuenta, type PagoCuenta, type PedidoCuenta } from "../../src/features/pago-cierre/cuenta-logica";
import { puedeModificar } from "../../src/features/pedidos/modificacion";
import { puedeCambiarEstado } from "../../src/features/pedidos/estados";

function pedido(estado: PedidoCuenta["estado"], centimos = 2000): PedidoCuenta {
  return { id: `p-${estado}`, alergia: null, numero: 1, estado, creadoEn: "2026-11-24T12:00:00Z",
    lineas: [{ nombre: "Ceviche", cantidad: 1, precioUnitarioCentimos: centimos, observacion: null }] } as PedidoCuenta;
}
function pago(estado: PagoCuenta["estado"], centimos = 2000): PagoCuenta {
  return { id: `pago-${estado}`, capturaId: null, metodo: "YAPE", estado, montoCentimos: centimos, creadoEn: "2026-11-24T12:05:00Z",
    recibidoCentimos: null, vueltoCentimos: null, referencia: null, registradoPor: null, stripe: false,
    verificadoPor: null, verificadoEn: null };
}

describe("US-106: el mesero solo ve si puede liberar la mesa", () => {
  it("con saldo pendiente: falta pagar en caja", () => {
    expect(estadoLiberacion(calcularCuenta([pedido("DELIVERED")], []))).toBe("FALTA_PAGAR");
  });
  it("con un Yape sin verificar: también falta pagar", () => {
    expect(estadoLiberacion(calcularCuenta([pedido("DELIVERED")], [pago("PENDING")]))).toBe("FALTA_PAGAR");
  });
  it("pagada pero con pedidos por entregar: aún no se libera", () => {
    expect(estadoLiberacion(calcularCuenta([pedido("READY")], [pago("CONFIRMED")]))).toBe("POR_ENTREGAR");
  });
  it("pagada y todo entregado: lista para liberar", () => {
    expect(estadoLiberacion(calcularCuenta([pedido("DELIVERED")], [pago("CONFIRMED")]))).toBe("LISTA");
  });
  it("los textos no muestran montos", () => {
    for (const texto of Object.values(TEXTO_LIBERACION)) expect(texto).not.toMatch(/S\/|\d/);
  });
});

describe("US-106: en /admin solo se cierra con excepción", () => {
  it("con saldo: ofrece la excepción (motivo obligatorio)", () => {
    const estado = evaluarCierreAdmin(calcularCuenta([pedido("DELIVERED")], []), true);
    expect(estado).toMatchObject({ ordinario: false, excepcion: true });
  });
  it("pagada: no ofrece el cierre normal, que es de caja", () => {
    const estado = evaluarCierreAdmin(calcularCuenta([pedido("DELIVERED")], [pago("CONFIRMED")]), true);
    expect(estado).toMatchObject({ ordinario: false, excepcion: false });
    expect(estado.aviso).toMatch(/caja/);
  });
  it("con pedidos por entregar: ni la excepción", () => {
    expect(evaluarCierreAdmin(calcularCuenta([pedido("READY")], []), true)).toMatchObject({ excepcion: false });
  });
});

describe("US-106: excepciones de dueño y admin sobre pedidos", () => {
  it("cancelan con motivo, pero no entregan", () => {
    expect(puedeCambiarEstado("IN_PROGRESS", "CANCELLED", ["OWNER"])).toBe(true);
    expect(puedeCambiarEstado("READY", "DELIVERED", ["ADMIN"])).toBe(false);
  });
  it("modifican en preparación, no pedidos pendientes (eso es del mesero)", () => {
    expect(puedeModificar("IN_PROGRESS", ["OWNER"])).toBe(true);
    expect(puedeModificar("PENDING", ["ADMIN"])).toBe(false);
    expect(puedeModificar("PENDING", ["WAITER"])).toBe(true);
  });
});
