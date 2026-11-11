import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcularVuelto,
  centimosATexto,
  mensajeErrorPago,
  AVISO_NUMERO_TARJETA,
  normalizarReferencia,
  pareceNumeroTarjeta,
  parsearSoles,
  puedeVerificarPagos,
  validarPagoEfectivo,
  validarPagoTarjeta,
  validarPagoYape,
} from "../../src/features/pago-cierre/pago-logica";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/features/auth/sesion", () => ({ obtenerSesion: vi.fn() }));
vi.mock("../../src/features/pago-cierre/aviso-n8n", () => ({ programarAvisoPago: vi.fn() }));
import { programarAvisoPago } from "../../src/features/pago-cierre/aviso-n8n";
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerSesion } from "../../src/features/auth/sesion";
import {
  registrarPagoEfectivoAction,
  registrarPagoTarjetaAction,
  registrarPagoYapeAction,
  verificarPagoAction,
} from "../../src/features/pago-cierre/actions";

const sesionId = "11111111-1111-4111-8111-111111111111";
const clave = "22222222-2222-4222-8222-222222222222";
const mesa = { tipo: "MESA" as const, id: sesionId };

describe("montos en soles US-022", () => {
  it.each([
    ["45", 4500], ["45.5", 4550], ["45,50", 4550], [" 0.10 ", 10], ["100000", 10_000_000],
  ])("lee %s como %i céntimos", (texto, centimos) => expect(parsearSoles(texto)).toBe(centimos));

  it.each(["", "0", "-5", "abc", "4.555", "1e3", "100000.01", "45.5.1"])("rechaza %j", (texto) => {
    expect(parsearSoles(texto)).toBeNull();
  });

  it("rechaza valores que no son texto", () => {
    expect(parsearSoles(45)).toBeNull();
    expect(parsearSoles(null)).toBeNull();
  });

  it("convierte céntimos a texto para la base sin errores de decimales", () => {
    expect(centimosATexto(4550)).toBe("45.50");
    expect(centimosATexto(10)).toBe("0.10");
  });
});

describe("vuelto y validación del efectivo US-022", () => {
  it("calcula el vuelto exacto", () => {
    expect(calcularVuelto(4550, 5000)).toBe(450);
    expect(calcularVuelto(4500, 4500)).toBe(0);
  });

  it("no hay vuelto si el efectivo no alcanza", () => {
    expect(calcularVuelto(4550, 4000)).toBeNull();
  });

  it("acepta pago completo y pago parcial", () => {
    expect(validarPagoEfectivo(4500, 5000, 4500)).toBeNull();
    expect(validarPagoEfectivo(2000, 2000, 4500)).toBeNull();
  });

  it("rechaza efectivo menor al monto", () => {
    expect(validarPagoEfectivo(4500, 4000, 4500)).toMatch(/no alcanza/);
  });

  it("rechaza cobrar más que el saldo", () => {
    expect(validarPagoEfectivo(5000, 5000, 4500)).toMatch(/mayor que el saldo/);
  });

  it("rechaza cuentas sin saldo y montos vacíos", () => {
    expect(validarPagoEfectivo(100, 100, 0)).toMatch(/no tiene saldo/);
    expect(validarPagoEfectivo(null, 100, 4500)).toMatch(/monto a cobrar/);
    expect(validarPagoEfectivo(100, null, 4500)).toMatch(/entregó el cliente/);
  });

  it("traduce los errores de la base y tiene un mensaje genérico", () => {
    expect(mensajeErrorPago("AMOUNT_EXCEEDS_BALANCE")).toMatch(/supera el saldo/);
    expect(mensajeErrorPago("INSUFFICIENT_CASH")).toMatch(/no alcanza/);
    expect(mensajeErrorPago("otro")).toMatch(/Inténtalo de nuevo/);
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

describe("acción de cobro en efectivo US-022", () => {
  it("manda montos exactos y la clave del intento a la base", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: { pago_id: "p1", estado: "CONFIRMED", vuelto: "4.50" }, error: null });
    const resultado = await registrarPagoEfectivoAction(mesa, "45.50", "50", clave);
    expect(resultado).toEqual({ ok: true, vueltoCentimos: 450 });
    expect(cliente.rpc).toHaveBeenCalledWith("registrar_pago", {
      p_sesion_id: sesionId, p_pedido_id: null, p_metodo: "CASH", p_monto: "45.50", p_recibido: "50.00",
      p_referencia: null, p_aprobado: null, p_clave: clave,
    });
  });

  it("para llevar usa el pedido, no la sesión", async () => {
    sesionCon("OWNER");
    const cliente = clienteConRpc({ data: { pago_id: "p1", estado: "CONFIRMED", vuelto: 0 }, error: null });
    await registrarPagoEfectivoAction({ tipo: "PARA_LLEVAR", id: sesionId }, "12", "12", clave);
    expect(cliente.rpc.mock.calls[0][1]).toMatchObject({ p_sesion_id: null, p_pedido_id: sesionId });
  });

  it("cocina no puede cobrar y no llega a la base", async () => {
    sesionCon("KITCHEN");
    const cliente = clienteConRpc({ data: null, error: null });
    expect(await registrarPagoEfectivoAction(mesa, "10", "10", clave)).toEqual({ ok: false, mensaje: mensajeErrorPago("FORBIDDEN") });
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("sin sesión no cobra", async () => {
    vi.mocked(obtenerSesion).mockResolvedValue(null);
    expect((await registrarPagoEfectivoAction(mesa, "10", "10", clave)).ok).toBe(false);
  });

  it("rechaza efectivo insuficiente y datos mal formados antes de ir a la base", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: null, error: null });
    expect(await registrarPagoEfectivoAction(mesa, "50", "40", clave)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no alcanza/) });
    expect((await registrarPagoEfectivoAction(mesa, "50", "50", "no-es-uuid")).ok).toBe(false);
    expect((await registrarPagoEfectivoAction({ tipo: "MESA", id: "x" }, "50", "50", clave)).ok).toBe(false);
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("muestra el mensaje del error que devuelve la base", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: null, error: { message: "AMOUNT_EXCEEDS_BALANCE", code: "22023" } });
    expect(await registrarPagoEfectivoAction(mesa, "50", "50", clave)).toEqual({
      ok: false, mensaje: mensajeErrorPago("AMOUNT_EXCEEDS_BALANCE"),
    });
  });
});

describe("Yape: referencia y validación US-023", () => {
  it.each([["12345678", "12345678"], [" op-123abc ", "OP-123ABC"]])("acepta la referencia %j", (texto, esperado) => {
    expect(normalizarReferencia(texto)).toBe(esperado);
  });

  it.each(["", "12", "4111 1111 1111 1111", "op#123", "x".repeat(41)])("rechaza la referencia %j", (texto) => {
    expect(normalizarReferencia(texto)).toBeNull();
  });

  it("exige monto válido, no mayor al saldo, y referencia", () => {
    expect(validarPagoYape(4500, "123456", 4500)).toBeNull();
    expect(validarPagoYape(5000, "123456", 4500)).toMatch(/mayor que el saldo/);
    expect(validarPagoYape(null, "123456", 4500)).toMatch(/monto válido/);
    expect(validarPagoYape(4500, null, 4500)).toMatch(/operación de Yape/);
    expect(validarPagoYape(100, "123456", 0)).toMatch(/no tiene saldo/);
  });

  it.each([
    [["CASHIER"], true], [["OWNER"], true], [["ADMIN"], true],
    [["WAITER"], false], [["KITCHEN"], false], [[], false],
  ])("verifica Yape con roles %j: %s", (roles, esperado) => {
    expect(puedeVerificarPagos(roles)).toBe(esperado);
  });
});

describe("acciones de Yape US-023", () => {
  it("registra el Yape como pendiente con la referencia limpia", async () => {
    sesionCon("WAITER");
    const cliente = clienteConRpc({ data: { pago_id: "p1", estado: "PENDING", vuelto: null }, error: null });
    expect(await registrarPagoYapeAction(mesa, "10", " op-555 ", clave)).toEqual({ ok: true });
    expect(cliente.rpc).toHaveBeenCalledWith("registrar_pago", expect.objectContaining({
      p_metodo: "YAPE", p_monto: "10.00", p_recibido: null, p_referencia: "OP-555", p_aprobado: null,
    }));
  });

  it("no registra un Yape sin referencia", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: null, error: null });
    expect((await registrarPagoYapeAction(mesa, "10", "", clave)).ok).toBe(false);
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("el mesero no puede verificar un Yape", async () => {
    sesionCon("WAITER");
    const cliente = { rpc: vi.fn() };
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
    const resultado = await verificarPagoAction(mesa, clave, true);
    expect(resultado).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo caja/) });
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("caja confirma o rechaza llamando a verificar_pago", async () => {
    sesionCon("CASHIER");
    const cliente = { rpc: vi.fn().mockResolvedValue({ data: "CONFIRMED", error: null }) };
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
    expect(await verificarPagoAction(mesa, clave, true)).toEqual({ ok: true });
    expect(cliente.rpc).toHaveBeenCalledWith("verificar_pago", { p_pago_id: clave, p_confirmar: true });
  });

  it("muestra el aviso si otra persona ya lo verificó", async () => {
    sesionCon("OWNER");
    const cliente = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "ALREADY_VERIFIED" } }) };
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
    expect(await verificarPagoAction(mesa, clave, false)).toEqual({ ok: false, mensaje: mensajeErrorPago("ALREADY_VERIFIED") });
  });

  it("rechaza datos mal formados al verificar", async () => {
    sesionCon("CASHIER");
    expect((await verificarPagoAction(mesa, "x", true)).ok).toBe(false);
    expect((await verificarPagoAction(mesa, clave, "si")).ok).toBe(false);
  });
});

describe("tarjeta: nunca guardar el número de la tarjeta US-024", () => {
  it.each(["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111", "5555555555554444", "ref4111111111111"])(
    "detecta %j como número de tarjeta y no lo acepta como referencia",
    (texto) => {
      expect(pareceNumeroTarjeta(texto)).toBe(true);
      expect(normalizarReferencia(texto)).toBeNull();
    },
  );

  it.each(["004512", "AUT-123456", "123456789012", "OP-2026-1103"])("acepta la referencia de voucher %j", (texto) => {
    expect(pareceNumeroTarjeta(texto)).toBe(false);
    expect(normalizarReferencia(texto)).not.toBeNull();
  });

  it("la base devuelve el mismo aviso si le llega un número de tarjeta", () => {
    // pagos.ts busca el nombre de la constraint dentro del mensaje de error de la base.
    expect(mensajeErrorPago("payments_reference_sin_tarjeta")).toBe(AVISO_NUMERO_TARJETA);
  });
});

describe("tarjeta: validación del pago US-024", () => {
  it("acepta aprobado y rechazado con referencia válida", () => {
    expect(validarPagoTarjeta(4500, "004512", true, 4500)).toBeNull();
    expect(validarPagoTarjeta(2000, "004512", false, 4500)).toBeNull();
  });

  it("exige elegir el resultado del POS", () => {
    expect(validarPagoTarjeta(4500, "004512", null, 4500)).toMatch(/aprobó o rechazó/);
  });

  it("avisa claramente si escriben el número de la tarjeta", () => {
    expect(validarPagoTarjeta(4500, "4111 1111 1111 1111", true, 4500)).toBe(AVISO_NUMERO_TARJETA);
  });

  it("rechaza monto inválido, mayor al saldo, sin saldo o sin referencia", () => {
    expect(validarPagoTarjeta(null, "004512", true, 4500)).toMatch(/monto válido/);
    expect(validarPagoTarjeta(5000, "004512", true, 4500)).toMatch(/mayor que el saldo/);
    expect(validarPagoTarjeta(100, "004512", true, 0)).toMatch(/no tiene saldo/);
    expect(validarPagoTarjeta(100, "", true, 4500)).toMatch(/referencia del voucher/);
  });
});

describe("acción de pago con tarjeta US-024", () => {
  it("aprobado: manda CARD con la referencia limpia y p_aprobado true", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: { pago_id: "p1", estado: "CONFIRMED", vuelto: null }, error: null });
    expect(await registrarPagoTarjetaAction(mesa, "45.50", " aut-123 ", true, clave)).toEqual({ ok: true, aprobado: true });
    expect(cliente.rpc).toHaveBeenCalledWith("registrar_pago", {
      p_sesion_id: sesionId, p_pedido_id: null, p_metodo: "CARD", p_monto: "45.50", p_recibido: null,
      p_referencia: "AUT-123", p_aprobado: true, p_clave: clave,
    });
  });

  it("rechazado: se registra y avisa que la cuenta sigue pendiente", async () => {
    sesionCon("OWNER");
    const cliente = clienteConRpc({ data: { pago_id: "p1", estado: "FAILED", vuelto: null }, error: null });
    expect(await registrarPagoTarjetaAction(mesa, "10", "004512", false, clave)).toEqual({ ok: true, aprobado: false });
    expect(cliente.rpc.mock.calls[0][1]).toMatchObject({ p_metodo: "CARD", p_aprobado: false });
  });

  it("en un reintento manda el estado que ya guardó la base", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: { pago_id: "p1", estado: "FAILED", vuelto: null }, error: null });
    expect(await registrarPagoTarjetaAction(mesa, "10", "004512", true, clave)).toEqual({ ok: true, aprobado: false });
  });

  it("nunca manda a la base un número de tarjeta", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: null, error: null });
    expect(await registrarPagoTarjetaAction(mesa, "10", "4111111111111111", true, clave)).toEqual({
      ok: false, mensaje: AVISO_NUMERO_TARJETA,
    });
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("exige el resultado como sí/no y no deja cobrar a cocina", async () => {
    sesionCon("CASHIER");
    const cliente = clienteConRpc({ data: null, error: null });
    expect((await registrarPagoTarjetaAction(mesa, "10", "004512", "true", clave)).ok).toBe(false);
    expect((await registrarPagoTarjetaAction(mesa, "10", "004512", null, clave)).ok).toBe(false);
    sesionCon("KITCHEN");
    expect(await registrarPagoTarjetaAction(mesa, "10", "004512", true, clave)).toEqual({
      ok: false, mensaje: mensajeErrorPago("FORBIDDEN"),
    });
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("muestra el error de la base (por ejemplo, monto mayor al saldo)", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: null, error: { message: "AMOUNT_EXCEEDS_BALANCE", code: "22023" } });
    expect(await registrarPagoTarjetaAction(mesa, "10", "004512", true, clave)).toEqual({
      ok: false, mensaje: mensajeErrorPago("AMOUNT_EXCEEDS_BALANCE"),
    });
  });
});

describe("aviso a n8n solo con pagos confirmados US-086", () => {
  it("efectivo confirmado avisa con el id del pago", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: { pago_id: "p1", estado: "CONFIRMED", vuelto: 0 }, error: null });
    await registrarPagoEfectivoAction(mesa, "10", "10", clave);
    expect(programarAvisoPago).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("tarjeta aprobada avisa; tarjeta rechazada no", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: { pago_id: "p1", estado: "CONFIRMED", vuelto: null }, error: null });
    await registrarPagoTarjetaAction(mesa, "10", "004512", true, clave);
    clienteConRpc({ data: { pago_id: "p2", estado: "FAILED", vuelto: null }, error: null });
    await registrarPagoTarjetaAction(mesa, "10", "004512", false, clave);
    expect(programarAvisoPago).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("Yape registrado (por verificar) no avisa; Yape confirmado por caja sí", async () => {
    sesionCon("CASHIER");
    clienteConRpc({ data: { pago_id: "p3", estado: "PENDING", vuelto: null }, error: null });
    await registrarPagoYapeAction(mesa, "10", "123456", clave);
    expect(programarAvisoPago).not.toHaveBeenCalled();

    vi.mocked(crearClienteServidor).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: "CONFIRMED", error: null }) } as never);
    await verificarPagoAction(mesa, clave, true);
    expect(programarAvisoPago).toHaveBeenCalledExactlyOnceWith(clave);
  });

  it("Yape rechazado o error de la base no avisa", async () => {
    sesionCon("CASHIER");
    vi.mocked(crearClienteServidor).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: "FAILED", error: null }) } as never);
    await verificarPagoAction(mesa, clave, false);
    clienteConRpc({ data: null, error: { message: "AMOUNT_EXCEEDS_BALANCE" } });
    await registrarPagoEfectivoAction(mesa, "10", "10", clave);
    expect(programarAvisoPago).not.toHaveBeenCalled();
  });
});
