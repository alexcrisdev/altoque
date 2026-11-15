import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcularCuenta, type PagoCuenta, type PedidoCuenta } from "../../src/features/pago-cierre/cuenta-logica";
import {
  CODIGOS_ERROR_CIERRE,
  evaluarCierre,
  mensajeErrorCierre,
  normalizarMotivo,
  puedeAutorizarExcepcion,
  validarMotivo,
} from "../../src/features/pago-cierre/cierre-logica";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerSesion } from "../../src/features/auth/sesion";
import { cerrarCuentaAction } from "../../src/features/pago-cierre/actions";

// US-020: cerrar la cuenta después del pago.

const sesionId = "11111111-1111-4111-8111-111111111111";
const mesa = { tipo: "MESA" as const, id: sesionId };
const motivoValido = "Cortesía autorizada por el dueño";

const pedido: PedidoCuenta = {
  id: "a", numero: 1, estado: "PENDING", creadoEn: "2026-11-04T18:00:00Z",
  lineas: [{ nombre: "Ceviche", cantidad: 1, precioUnitarioCentimos: 3500, observacion: null }],
};
function pago(parcial: Partial<PagoCuenta> & Pick<PagoCuenta, "id">): PagoCuenta {
  return { metodo: "CASH", estado: "CONFIRMED", montoCentimos: 3500, creadoEn: "2026-11-04T19:00:00Z", ...parcial };
}

describe("US-020: qué cierre se permite", () => {
  it("con saldo cero: cierre ordinario", () => {
    const estado = evaluarCierre(calcularCuenta([pedido], [pago({ id: "p1" })]), false);
    expect(estado).toMatchObject({ ordinario: true, excepcion: false });
  });

  it("una mesa sin pedidos se cierra de forma ordinaria", () => {
    expect(evaluarCierre(calcularCuenta([], []), false).ordinario).toBe(true);
  });

  it("con saldo: ni el cajero ni el mesero pueden cerrarla", () => {
    const estado = evaluarCierre(calcularCuenta([pedido], [pago({ id: "p1", montoCentimos: 1000 })]), false);
    expect(estado).toMatchObject({ ordinario: false, excepcion: false });
    expect(estado.aviso).toContain("dueño o al administrador");
  });

  it("con saldo: el dueño o admin puede cerrar solo como excepción", () => {
    const estado = evaluarCierre(calcularCuenta([pedido], []), true);
    expect(estado).toMatchObject({ ordinario: false, excepcion: true });
  });

  it("un pago fallido no cuenta: la cuenta sigue con saldo y no se cierra sola", () => {
    const cuenta = calcularCuenta([pedido], [pago({ id: "p1", metodo: "CARD", estado: "FAILED" })]);
    expect(cuenta.saldoCentimos).toBe(3500);
    expect(cuenta.puedeCerrar).toBe(false);
    expect(evaluarCierre(cuenta, false).ordinario).toBe(false);
  });

  it("un Yape por verificar bloquea el cierre, incluso la excepción", () => {
    const cuenta = calcularCuenta([pedido], [
      pago({ id: "p1", montoCentimos: 2500 }),
      pago({ id: "p2", metodo: "YAPE", estado: "PENDING", montoCentimos: 1000 }),
    ]);
    const estado = evaluarCierre(cuenta, true);
    expect(estado).toMatchObject({ ordinario: false, excepcion: false });
    expect(estado.aviso).toContain("1 pago(s) Yape por verificar");
  });

  it("aunque el saldo esté en cero, un Yape pendiente impide el cierre ordinario", () => {
    const cuenta = calcularCuenta([pedido], [
      pago({ id: "p1" }),
      pago({ id: "p2", metodo: "YAPE", estado: "PENDING", montoCentimos: 100 }),
    ]);
    expect(cuenta.saldoCentimos).toBe(0);
    expect(cuenta.puedeCerrar).toBe(false);
  });

  it("para llevar, el cierre no depende del estado de preparación del pedido", () => {
    for (const estado of ["PENDING", "IN_PROGRESS", "READY", "DELIVERED"] as const) {
      const cuenta = calcularCuenta([{ ...pedido, estado }], [pago({ id: "p1" })]);
      expect(evaluarCierre(cuenta, false).ordinario).toBe(true);
    }
  });
});

describe("US-063: una mesa no se cierra con pedidos sin entregar", () => {
  it("pagada pero con un pedido en cocina o listo: no se cierra en mesa", () => {
    for (const estado of ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY"] as const) {
      const cuenta = calcularCuenta([{ ...pedido, estado }], [pago({ id: "p1" })]);
      expect(cuenta.pedidosSinEntregar).toBe(1);
      const cierre = evaluarCierre(cuenta, false, true);
      expect(cierre).toMatchObject({ ordinario: false, excepcion: false });
      expect(cierre.aviso).toContain("Hay pedidos sin entregar");
    }
  });

  it("tampoco con excepción: el dueño primero entrega o cancela", () => {
    const cuenta = calcularCuenta([{ ...pedido, estado: "IN_PROGRESS" }], []);
    expect(evaluarCierre(cuenta, true, true)).toMatchObject({ ordinario: false, excepcion: false });
  });

  it("entregado o cancelado ya no cuenta como pendiente", () => {
    const cuenta = calcularCuenta(
      [{ ...pedido, estado: "DELIVERED" }, { ...pedido, id: "b", numero: 2, estado: "CANCELLED" }],
      [pago({ id: "p1" })],
    );
    expect(cuenta.pedidosSinEntregar).toBe(0);
    expect(evaluarCierre(cuenta, false, true).ordinario).toBe(true);
  });

  it("cuenta cuántos faltan en el aviso", () => {
    const cuenta = calcularCuenta(
      [{ ...pedido, estado: "READY" }, { ...pedido, id: "b", numero: 2, estado: "IN_PROGRESS" }],
      [pago({ id: "p1", montoCentimos: 7000 })],
    );
    expect(evaluarCierre(cuenta, false, true).aviso).toContain("faltan 2");
  });

  it("un Yape por verificar se avisa primero", () => {
    const cuenta = calcularCuenta([{ ...pedido, estado: "IN_PROGRESS" }], [pago({ id: "p1", metodo: "YAPE", estado: "PENDING" })]);
    expect(evaluarCierre(cuenta, false, true).aviso).toContain("por verificar");
  });

  it("traduce el rechazo de la base", () => {
    const codigo = CODIGOS_ERROR_CIERRE.find((c) => "ERROR: PEDIDOS_SIN_ENTREGAR".includes(c));
    expect(codigo).toBe("PEDIDOS_SIN_ENTREGAR");
    expect(mensajeErrorCierre("PEDIDOS_SIN_ENTREGAR")).toContain("Hay pedidos sin entregar");
  });
});

describe("US-020: excepción autorizada", () => {
  it("solo dueño y admin la autorizan", () => {
    expect(puedeAutorizarExcepcion(["OWNER"])).toBe(true);
    expect(puedeAutorizarExcepcion(["ADMIN"])).toBe(true);
    expect(puedeAutorizarExcepcion(["CASHIER", "WAITER", "KITCHEN"])).toBe(false);
  });

  it("limpia espacios del motivo y exige de 10 a 300 caracteres", () => {
    expect(normalizarMotivo("  Cliente   se fue  ")).toBe("Cliente se fue");
    expect(normalizarMotivo("   ")).toBeNull();
    expect(normalizarMotivo(42)).toBeNull();
    expect(validarMotivo(null)).not.toBeNull();
    expect(validarMotivo("corto")).not.toBeNull();
    expect(validarMotivo("x".repeat(301))).not.toBeNull();
    expect(validarMotivo(motivoValido)).toBeNull();
  });

  it("traduce los códigos de la base, sin confundir EXCEPTION_FORBIDDEN con FORBIDDEN", () => {
    const codigo = CODIGOS_ERROR_CIERRE.find((c) => "ERROR: EXCEPTION_FORBIDDEN".includes(c));
    expect(codigo).toBe("EXCEPTION_FORBIDDEN");
    expect(mensajeErrorCierre("PENDING_PAYMENTS")).toContain("por verificar");
    expect(mensajeErrorCierre("desconocido")).toContain("No se pudo cerrar");
  });
});

function clienteConRpc(respuesta: { data: unknown; error: unknown }) {
  const llamada = { single: vi.fn().mockReturnThis(), overrideTypes: vi.fn().mockResolvedValue(respuesta) };
  const cliente = { rpc: vi.fn().mockReturnValue(llamada) };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
  return cliente;
}

function sesionCon(rol: string) {
  vi.mocked(obtenerSesion).mockResolvedValue({ usuario: {}, membresias: [{ restaurantId: "r", branchId: null, rol }] } as never);
}

beforeEach(() => vi.resetAllMocks());

describe("US-020: acción cerrarCuentaAction", () => {
  it("cierre ordinario de una mesa: manda la sesión sin motivo", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: { cierre_id: "c", tipo: "ORDINARY" }, error: null });
    await expect(cerrarCuentaAction(mesa, "")).resolves.toEqual({ ok: true, tipo: "ORDINARY" });
    expect(cliente.rpc).toHaveBeenCalledWith("cerrar_cuenta", { p_sesion_id: sesionId, p_pedido_id: null, p_motivo: null });
  });

  it("para llevar: manda el pedido", async () => {
    sesionCon("WAITER");
    const cliente = clienteConRpc({ data: { cierre_id: "c", tipo: "ORDINARY" }, error: null });
    await cerrarCuentaAction({ tipo: "PARA_LLEVAR", id: sesionId }, null);
    expect(cliente.rpc.mock.calls[0][1]).toMatchObject({ p_sesion_id: null, p_pedido_id: sesionId });
  });

  it("el admin cierra con excepción y el motivo llega limpio", async () => {
    sesionCon("ADMIN");
    const cliente = clienteConRpc({ data: { cierre_id: "c", tipo: "EXCEPTION" }, error: null });
    await expect(cerrarCuentaAction(mesa, `  ${motivoValido}  `)).resolves.toEqual({ ok: true, tipo: "EXCEPTION" });
    expect(cliente.rpc.mock.calls[0][1]).toMatchObject({ p_motivo: motivoValido });
  });

  it("un cajero no puede mandar una excepción", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: null, error: null });
    const resultado = await cerrarCuentaAction(mesa, motivoValido);
    expect(resultado).toEqual({ ok: false, mensaje: mensajeErrorCierre("EXCEPTION_FORBIDDEN") });
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("motivo muy corto: no llama a la base", async () => {
    sesionCon("OWNER");
    const cliente = clienteConRpc({ data: null, error: null });
    expect((await cerrarCuentaAction(mesa, "corto")).ok).toBe(false);
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("cocina, sin sesión o con datos inválidos: no llama a la base", async () => {
    sesionCon("KITCHEN");
    const cliente = clienteConRpc({ data: null, error: null });
    expect((await cerrarCuentaAction(mesa, null)).ok).toBe(false);
    vi.mocked(obtenerSesion).mockResolvedValue(null);
    expect((await cerrarCuentaAction(mesa, null)).ok).toBe(false);
    sesionCon("CASHIER");
    expect((await cerrarCuentaAction({ tipo: "MESA", id: "no-es-uuid" }, null)).ok).toBe(false);
    expect((await cerrarCuentaAction({ tipo: "OTRA", id: sesionId } as never, null)).ok).toBe(false);
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("muestra el motivo de la base cuando rechaza el cierre", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: null, error: { message: "SALDO_PENDIENTE", code: "22023" } });
    expect(await cerrarCuentaAction(mesa, null)).toEqual({ ok: false, mensaje: mensajeErrorCierre("SALDO_PENDIENTE") });
    clienteConRpc({ data: null, error: { message: "PENDING_PAYMENTS", code: "22023" } });
    expect(await cerrarCuentaAction(mesa, null)).toEqual({ ok: false, mensaje: mensajeErrorCierre("PENDING_PAYMENTS") });
    clienteConRpc({ data: null, error: { message: "PEDIDOS_SIN_ENTREGAR", code: "23514" } });
    expect(await cerrarCuentaAction(mesa, null)).toEqual({ ok: false, mensaje: mensajeErrorCierre("PEDIDOS_SIN_ENTREGAR") });
  });
});
