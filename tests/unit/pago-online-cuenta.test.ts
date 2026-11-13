import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));
vi.mock("@/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("@/features/mesero/sesiones", () => ({ buscarSesionAbierta: vi.fn() }));

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { buscarSesionAbierta } from "@/features/mesero/sesiones";
import { resolverCuentaOnline } from "../../src/features/pago-cierre/pago-online";

const clave = "11111111-2222-4333-8444-555555555555";

function acceso(modalidad: "DINE_IN" | "TAKEAWAY" = "DINE_IN") {
  vi.mocked(resolverAccesoQr).mockResolvedValue({
    estado: "VALIDO", qrId: "qr-autorizado", modalidad,
    restauranteId: "restaurante-autorizado", restauranteNombre: "Restaurante demo",
    localId: "local-demo", localNombre: "Local demo",
    mesa: modalidad === "DINE_IN" ? { id: "mesa-demo", numero: 3 } : null,
  });
}

function consulta() {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "pedido-propio" }, error: null }),
  };
  const cliente = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: "10.00", error: null }),
  };
  vi.mocked(crearClienteAdmin).mockReturnValue(cliente as unknown as ReturnType<typeof crearClienteAdmin>);
  return { cliente, query };
}

beforeEach(() => {
  vi.resetAllMocks();
  acceso();
  vi.mocked(buscarSesionAbierta).mockResolvedValue({ id: "sesion-mesa", abiertaDesde: "2026-11-12T15:00:00Z" });
});

describe("US-085: resolver la cuenta correcta antes de Stripe", () => {
  it.each(["TAKEAWAY", "DINE_IN"] as const)(
    "una clave de pedido para llevar cobra ese pedido desde un QR %s", async modalidad => {
      acceso(modalidad);
      const { cliente, query } = consulta();
      const resultado = await resolverCuentaOnline("token-demo", clave);
      expect(resultado).toMatchObject({
        cuenta: { tipo: "PARA_LLEVAR", id: "pedido-propio" },
        restauranteId: "restaurante-autorizado", mesaNumero: null, saldoCentimos: 1000,
      });
      expect(buscarSesionAbierta).not.toHaveBeenCalled();
      expect(cliente.from).toHaveBeenCalledWith("orders");
      expect(query.eq.mock.calls).toEqual([
        ["restaurant_id", "restaurante-autorizado"], ["qr_code_id", "qr-autorizado"],
        ["idempotency_key", clave], ["modality", "TAKEAWAY"],
      ]);
      expect(cliente.rpc).toHaveBeenCalledExactlyOnceWith("saldo_cuenta_online", {
        p_sesion_id: null, p_pedido_id: "pedido-propio",
      });
    },
  );

  it("sin clave, el QR de mesa conserva su cuenta de sesión", async () => {
    const { cliente } = consulta();
    expect(await resolverCuentaOnline("token-demo", null)).toMatchObject({
      cuenta: { tipo: "MESA", id: "sesion-mesa" }, mesaNumero: 3, saldoCentimos: 1000,
    });
    expect(buscarSesionAbierta).toHaveBeenCalledExactlyOnceWith("mesa-demo");
    expect(cliente.from).not.toHaveBeenCalled();
    expect(cliente.rpc).toHaveBeenCalledExactlyOnceWith("saldo_cuenta_online", {
      p_sesion_id: "sesion-mesa", p_pedido_id: null,
    });
  });

  it.each(["", "clave-invalida"])("una clave inválida (%j) no cobra la mesa", async valor => {
    consulta();
    expect(await resolverCuentaOnline("token-demo", valor)).toBeNull();
    expect(buscarSesionAbierta).not.toHaveBeenCalled();
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });

  it("un pedido ausente o ajeno no se reemplaza por la cuenta de mesa", async () => {
    const { cliente, query } = consulta();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await resolverCuentaOnline("token-demo", clave)).toBeNull();
    expect(buscarSesionAbierta).not.toHaveBeenCalled();
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("un QR inválido no consulta cuentas", async () => {
    vi.mocked(resolverAccesoQr).mockResolvedValue({ estado: "INVALIDO" });
    expect(await resolverCuentaOnline("token-demo", clave)).toBeNull();
    expect(crearClienteAdmin).not.toHaveBeenCalled();
    expect(buscarSesionAbierta).not.toHaveBeenCalled();
  });

  it("el mostrador necesita una clave de pedido", async () => {
    acceso("TAKEAWAY");
    expect(await resolverCuentaOnline("token-demo", null)).toBeNull();
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });

  it("un fallo al buscar el pedido no se convierte en una cuenta de mesa", async () => {
    const { cliente, query } = consulta();
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "Fallo simulado" } });
    await expect(resolverCuentaOnline("token-demo", clave)).rejects.toThrow("No se pudo buscar el pedido para llevar");
    expect(buscarSesionAbierta).not.toHaveBeenCalled();
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it("una cuenta cerrada no permite iniciar el pago", async () => {
    const { cliente } = consulta();
    cliente.rpc.mockResolvedValue({ data: null, error: null });
    expect(await resolverCuentaOnline("token-demo", clave)).toBeNull();
  });

  it("una mesa sin sesión no devuelve cuenta", async () => {
    vi.mocked(buscarSesionAbierta).mockResolvedValue(null);
    const { cliente } = consulta();
    expect(await resolverCuentaOnline("token-demo", null)).toBeNull();
    expect(cliente.rpc).not.toHaveBeenCalled();
  });
});
