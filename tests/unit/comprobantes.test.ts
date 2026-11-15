import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { cabecerasAviso, verificarFirmaAviso } from "../../src/features/pago-cierre/aviso-n8n-logica";
import { leerCorreoBoleta, leerResultadoComprobante } from "../../src/features/pago-cierre/comprobante-logica";
import { prepararBoleta, resultadoNubefact } from "../../infra/n8n/flujos/boleta-logica.mjs";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));
import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import { POST } from "../../src/app/api/n8n/comprobantes/route";
import { interpretarSesionPagada } from "../../src/features/pago-cierre/stripe-logica";

const secreto = "secreto-ficticio-solo-para-pruebas-unitarias";
const fecha = 1794672000000;
const dato = { pago_id: "11111111-2222-4333-8444-555555555555", serie: "BBB1", numero: 7, estado: "EMITIDO", enlace_pdf: "https://boleta.example.test/7.pdf", enlace_xml: "https://boleta.example.test/7.xml" };
const aviso = {
  evento: "pago_confirmado", version: 2, id: dato.pago_id,
  cuenta: { saldo_restante: "0.00" }, comprobante: { id: "reserva", serie: "BBB1", numero: 7, is_test: true, estado: "PENDIENTE" },
  pago: { confirmado_en: "2026-11-14T16:00:00Z" },
  platos: [{ nombre: "Ceviche", cantidad: 2, precio_unitario: "32.00", subtotal: "64.00" }, { nombre: "Bebida", cantidad: 1, precio_unitario: "6.00", subtotal: "6.00" }],
};

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(fecha); vi.stubEnv("N8N_WEBHOOK_SECRET", secreto); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("correo voluntario US-088", () => {
  it("el webhook solo toma receipt_email de metadata y omite el email que pudiera pedir Stripe", () => {
    const sesion = { id: "cs_test_abc123", payment_status: "paid", currency: "pen", amount_total: 1000, payment_intent: "pi_123456789", metadata: { tipo: "MESA", cuenta_id: dato.pago_id, restaurante_id: dato.pago_id, checkout_id: "cccccccc-dddd-4eee-8fff-000000000001" }, customer_details: { email: "stripe@example.test" } };
    expect(interpretarSesionPagada(sesion)).not.toHaveProperty("correoBoleta");
    expect(interpretarSesionPagada({ ...sesion, metadata: { ...sesion.metadata, receipt_email: "voluntario@example.test" } })).toMatchObject({ ok: true, correoBoleta: "voluntario@example.test" });
    const alterado = interpretarSesionPagada({ ...sesion, metadata: { ...sesion.metadata, receipt_email: "invalido" } });
    expect(alterado).toMatchObject({ ok: true });
    expect(alterado).not.toHaveProperty("correoBoleta");
  });
  it.each([undefined, null, "", "   "])("permite omitir %j", (entrada) => expect(leerCorreoBoleta(entrada)).toEqual({ ok: true, correo: null }));
  it("normaliza espacios sin alterar el correo", () => expect(leerCorreoBoleta(" cliente@example.test ")).toEqual({ ok: true, correo: "cliente@example.test" }));
  it.each([42, "a@b", "a b@c.test", "a@b@c.test", "a\n@b.test", `${"a".repeat(245)}@demo.test`])("rechaza %j", (correo) => expect(leerCorreoBoleta(correo).ok).toBe(false));
});

describe("firma de regreso US-088", () => {
  it("acepta firma del cuerpo original y rechaza alteración, desfase futuro y vencimiento", () => {
    const cuerpo = JSON.stringify(dato);
    const h = cabecerasAviso(cuerpo, secreto, fecha / 1000);
    expect(verificarFirmaAviso(cuerpo, secreto, h["X-AlToque-Timestamp"], h["X-AlToque-Firma"], fecha)).toBe(true);
    for (const ahora of [fecha - 301000, fecha + 301000]) expect(verificarFirmaAviso(cuerpo, secreto, h["X-AlToque-Timestamp"], h["X-AlToque-Firma"], ahora)).toBe(false);
    expect(verificarFirmaAviso(cuerpo + " ", secreto, h["X-AlToque-Timestamp"], h["X-AlToque-Firma"], fecha)).toBe(false);
    expect(verificarFirmaAviso(cuerpo, "otro-secreto-de-al-menos-32-caracteres", h["X-AlToque-Timestamp"], h["X-AlToque-Firma"], fecha)).toBe(false);
    expect(verificarFirmaAviso(cuerpo, secreto, h["X-AlToque-Timestamp"], "sha256=00", fecha)).toBe(false);
  });
  it("valida serie, enlaces seguros y número antes de guardar", () => {
    expect(leerResultadoComprobante(dato)).toEqual(dato);
    for (const cambio of [{ numero: 0 }, { serie: "FFF1" }, { enlace_pdf: "javascript:alert(1)" }, { enlace_xml: "http://local/xml" }, { enlace_pdf: "https://user:pass@example.test/pdf" }]) expect(leerResultadoComprobante({ ...dato, ...cambio })).toBeNull();
  });
  it("sin firma responde 401 y no accede a la base", async () => {
    const respuesta = await POST(new Request("http://localhost/api/n8n/comprobantes", { method: "POST", body: JSON.stringify(dato) }));
    expect(respuesta.status).toBe(401);
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
  it("firma válida llama a la actualización de la reserva; un reintento usa los mismos identificadores", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "reserva", error: null });
    vi.mocked(crearClienteAdmin).mockReturnValue({ rpc } as unknown as ReturnType<typeof crearClienteAdmin>);
    const cuerpo = JSON.stringify(dato);
    for (let i = 0; i < 2; i++) {
      const r = await POST(new Request("http://localhost/api/n8n/comprobantes", { method: "POST", body: cuerpo, headers: cabecerasAviso(cuerpo, secreto, fecha / 1000) }));
      expect(r.status).toBe(200);
    }
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][0]).toBe("actualizar_boleta_prueba");
  });
  it("rechaza JSON firmado inválido y cuerpos grandes sin escribir", async () => {
    for (const [cuerpo, codigo] of [["{", 400], ["x".repeat(16385), 413]] as const) {
      const r = await POST(new Request("http://localhost/api/n8n/comprobantes", { method: "POST", body: cuerpo, headers: cabecerasAviso(cuerpo, secreto, fecha / 1000) }));
      expect(r.status).toBe(codigo);
    }
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
  it("un número diferente o una reserva ausente responde 409", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "INVALID_RECEIPT" } });
    vi.mocked(crearClienteAdmin).mockReturnValue({ rpc } as unknown as ReturnType<typeof crearClienteAdmin>);
    const cuerpo = JSON.stringify(dato);
    expect((await POST(new Request("http://localhost/api/n8n/comprobantes", { method: "POST", body: cuerpo, headers: cabecerasAviso(cuerpo, secreto, fecha / 1000) }))).status).toBe(409);
  });
});

describe("contrato Nubefact sin red", () => {
  it("usa la fecha de emisión actual de Lima al reintentar, sin cambiar el número reservado", () => {
    const boleta = prepararBoleta(aviso, new Date("2026-11-16T02:00:00Z"))!;
    expect(boleta.fecha_de_emision).toBe("15-11-2026");
    expect(boleta.numero).toBe(7);
  });
  it("el código exportado para n8n ejecuta preparación y lectura del proveedor en sandbox", () => {
    const flujo = JSON.parse(readFileSync("infra/n8n/flujos/boleta-nubefact.json", "utf8"));
    const preparacion = flujo.nodes.find((n: { name: string }) => n.name === "Preparar boleta").parameters.jsCode;
    const contexto = { $: (nombre: string) => ({ first: () => ({ json: nombre === "Secreto compartido" ? { demo_confirmado: true } : { aviso } }) }) };
    const resultado = runInNewContext(`(function(){${preparacion}})()`, contexto);
    expect(resultado[0].json.solicitud.total).toBe(70);
    const codigo = flujo.nodes.find((n: { name: string }) => n.name === "Resultado de emisión").parameters.jsCode;
    const respuesta = { serie: "BBB1", numero: 7, enlace_del_pdf: dato.enlace_pdf, enlace_del_xml: dato.enlace_xml };
    const lectura = runInNewContext(`(function(){${codigo}})()`, { $: () => ({ first: () => ({ json: { aviso } }) }), $input: { first: () => ({ json: respuesta }) } });
    expect(lectura[0].json).toEqual(dato);
    expect(flujo.active).toBe(false);
    expect(flujo.nodes.find((n: { name: string }) => n.name === "Secreto compartido").parameters.assignments.assignments.find((a: { name: string }) => a.name === "demo_confirmado").value).toBe(false);
  });
  it("usa la reserva, tipo 2 y VARIOS, convierte precio bruto a base e IGV", () => {
    const solicitud = prepararBoleta(aviso)!;
    expect(solicitud).toMatchObject({ tipo_de_comprobante: 2, serie: "BBB1", numero: 7, cliente_tipo_de_documento: "-", cliente_denominacion: "VARIOS", total: 70, porcentaje_de_igv: 18 });
    expect(solicitud.items).toHaveLength(2);
    expect(solicitud.items[0]).toMatchObject({ cantidad: 2, precio_unitario: 32, subtotal: 54.24, igv: 9.76, total: 64 });
    expect(Math.round((solicitud.total_gravada + solicitud.total_igv) * 100)).toBe(7000);
    expect(prepararBoleta(aviso)).toEqual(solicitud);
  });
  it("no emite pagos parciales, avisos viejos, reservas ausentes o ya emitidas", () => {
    for (const cambio of [{ version: 1 }, { cuenta: { saldo_restante: "1.00" } }, { comprobante: null }, { comprobante: { ...aviso.comprobante, estado: "EMITIDO" } }]) expect(prepararBoleta({ ...aviso, ...cambio })).toBeNull();
  });
  it("rechaza importes sin documento desde 700 y líneas inconsistentes", () => {
    expect(() => prepararBoleta({ ...aviso, platos: [{ nombre: "Plato", cantidad: 1, precio_unitario: "700.00", subtotal: "700.00" }] })).toThrow("700");
    expect(() => prepararBoleta({ ...aviso, platos: [{ nombre: "Plato", cantidad: 2, precio_unitario: "32.00", subtotal: "32.00" }] })).toThrow("Plato");
  });
  it("solo acepta enlaces de una respuesta que coincide con la reserva", () => {
    const respuesta = { serie: "BBB1", numero: 7, enlace_del_pdf: dato.enlace_pdf, enlace_del_xml: dato.enlace_xml };
    expect(resultadoNubefact(respuesta, aviso)).toEqual(dato);
    expect(resultadoNubefact({ ...respuesta, numero: 8 }, aviso).estado).toBe("ERROR");
    expect(resultadoNubefact({ codigo: 10, errors: "Token incorrecto" }, aviso).estado).toBe("ERROR");
  });
});
