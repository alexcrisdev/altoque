import { describe, expect, it } from "vitest";
import { textoTiempoEstimado } from "../../src/features/pedidos/linea-tiempo-cliente";
import {
  construirLineaTiempo,
  estimarTiempoRestante,
  formatearHoraLima,
  inicioEnCocina,
  MINUTOS_PREPARACION_POR_DEFECTO,
  porcentajeAvance,
  type EventoEstado,
} from "../../src/features/pedidos/linea-tiempo";

// Horas en UTC: Lima es UTC-5, así que 17:44Z = 12:44 en Lima.
const creado = "2026-11-17T17:44:10.000Z";
const enviado: EventoEstado = { desde: null, hacia: "PENDING", creadoEn: creado };
const pagado: EventoEstado = { desde: "PENDING", hacia: "IN_PROGRESS", creadoEn: "2026-11-17T17:45:30.000Z" };
const listo: EventoEstado = { desde: "IN_PROGRESS", hacia: "READY", creadoEn: "2026-11-17T17:58:00.000Z" };
const entregado: EventoEstado = { desde: "READY", hacia: "DELIVERED", creadoEn: "2026-11-17T18:02:59.000Z" };

const resumen = (pasos: ReturnType<typeof construirLineaTiempo>) =>
  pasos.map((paso) => `${paso.clave} ${paso.hora ?? "-"} ${paso.estado}`);

describe("US-092: hora en Lima", () => {
  it("muestra HH:MM en America/Lima con reloj de 24 horas", () => {
    expect(formatearHoraLima("2026-11-17T17:44:59.000Z")).toBe("12:44");
    expect(formatearHoraLima("2026-11-18T04:05:00.000Z")).toBe("23:05");
    expect(formatearHoraLima("2026-11-17T05:07:00.000Z")).toBe("00:07");
    expect(formatearHoraLima("no es fecha")).toBeNull();
  });
});

describe("US-092: línea de tiempo del pedido", () => {
  it("muestra los pasos y sus horas en el orden correcto, aunque el historial llegue desordenado", () => {
    const pasos = construirLineaTiempo([entregado, listo, enviado, pagado], "DELIVERED", creado);

    expect(resumen(pasos)).toEqual([
      "ENVIADO 12:44 hecho",
      "PAGADO 12:45 hecho",
      "EN_COCINA 12:45 hecho",
      "LISTO 12:58 hecho",
      "ENTREGADO 13:02 actual",
    ]);
    expect(pasos.map((paso) => paso.etiqueta)).toEqual([
      "Pedido enviado", "Pago confirmado", "En cocina", "Listo", "Entregado",
    ]);
    // Las horas nunca retroceden.
    const horas = pasos.map((paso) => paso.hora!);
    expect([...horas].sort()).toEqual(horas);
  });

  it("resalta Enviado como paso actual mientras espera el pago", () => {
    expect(resumen(construirLineaTiempo([enviado], "PENDING", creado))).toEqual([
      "ENVIADO 12:44 actual",
      "PAGADO - pendiente",
      "EN_COCINA - pendiente",
      "LISTO - pendiente",
      "ENTREGADO - pendiente",
    ]);
  });

  it("al pagar, el pedido pasa a En cocina como paso actual", () => {
    expect(resumen(construirLineaTiempo([enviado, pagado], "IN_PROGRESS", creado))).toEqual([
      "ENVIADO 12:44 hecho",
      "PAGADO 12:45 hecho",
      "EN_COCINA 12:45 actual",
      "LISTO - pendiente",
      "ENTREGADO - pendiente",
    ]);
  });

  it("oculta Pagado cuando el pedido no pasó por PENDING (pedido del mesero o antiguo)", () => {
    const directo: EventoEstado = { desde: null, hacia: "IN_PROGRESS", creadoEn: creado };
    const pasos = construirLineaTiempo([directo, listo], "READY", creado);

    expect(resumen(pasos)).toEqual([
      "ENVIADO 12:44 hecho",
      "EN_COCINA 12:44 hecho",
      "LISTO 12:58 actual",
      "ENTREGADO - pendiente",
    ]);
  });

  it("no cuenta un Listo que cocina deshizo y usa el último Listo", () => {
    const deshecho: EventoEstado = { desde: "READY", hacia: "IN_PROGRESS", creadoEn: "2026-11-17T17:59:00.000Z" };
    const listoOtraVez: EventoEstado = { desde: "IN_PROGRESS", hacia: "READY", creadoEn: "2026-11-17T18:01:00.000Z" };

    expect(construirLineaTiempo([enviado, pagado, listo, deshecho], "IN_PROGRESS", creado)
      .map((paso) => paso.hora)).toEqual(["12:44", "12:45", "12:45", null, null]);
    expect(construirLineaTiempo([enviado, pagado, listo, deshecho, listoOtraVez], "READY", creado)
      .find((paso) => paso.clave === "LISTO")?.hora).toBe("13:01");
  });

  it("pedido cancelado: muestra hasta donde llegó más el paso Cancelado", () => {
    const cancelado: EventoEstado = { desde: "IN_PROGRESS", hacia: "CANCELLED", creadoEn: "2026-11-17T17:50:00.000Z" };

    expect(resumen(construirLineaTiempo([enviado, pagado, cancelado], "CANCELLED", creado))).toEqual([
      "ENVIADO 12:44 hecho",
      "PAGADO 12:45 hecho",
      "EN_COCINA 12:45 hecho",
      "CANCELADO 12:50 actual",
    ]);
  });

  it("pedido vencido sin pago: solo Enviado y Cancelado", () => {
    const vencido: EventoEstado = { desde: "PENDING", hacia: "CANCELLED", creadoEn: "2026-11-17T17:59:10.000Z" };
    const pasos = construirLineaTiempo([enviado, vencido], "CANCELLED", creado);

    expect(resumen(pasos)).toEqual(["ENVIADO 12:44 hecho", "CANCELADO 12:59 actual"]);
  });

  it("sin historial usa la hora de creación del pedido", () => {
    expect(construirLineaTiempo([], "PENDING", creado)[0]).toMatchObject({
      clave: "ENVIADO", hora: "12:44", estado: "actual",
    });
  });

  it("calcula el avance de la barra según el paso actual", () => {
    expect(porcentajeAvance(construirLineaTiempo([enviado], "PENDING", creado))).toBe(20);
    expect(porcentajeAvance(construirLineaTiempo([enviado, pagado, listo], "READY", creado))).toBe(80);
    expect(porcentajeAvance(construirLineaTiempo([enviado, pagado, listo, entregado], "DELIVERED", creado))).toBe(100);
    expect(porcentajeAvance([])).toBe(0);
  });
});

describe("US-092: tiempo estimado restante", () => {
  const ahora = Date.parse("2026-11-17T17:50:30.000Z"); // 5 min después de entrar a cocina
  const doceMinutos = 12 * 60_000;

  it("en cocina descuenta lo que ya pasó del promedio del restaurante", () => {
    expect(estimarTiempoRestante("IN_PROGRESS", doceMinutos, pagado.creadoEn, ahora)).toEqual({
      minutos: 7, porDefecto: false, despuesDelPago: false,
    });
  });

  it("sin datos del restaurante usa el valor fijo y lo marca como aproximado", () => {
    expect(estimarTiempoRestante("IN_PROGRESS", null, pagado.creadoEn, ahora)).toEqual({
      minutos: MINUTOS_PREPARACION_POR_DEFECTO - 5, porDefecto: true, despuesDelPago: false,
    });
  });

  it("si ya pasó el promedio muestra 1 minuto, nunca negativo", () => {
    expect(estimarTiempoRestante("IN_PROGRESS", 4 * 60_000, pagado.creadoEn, ahora)).toEqual({
      minutos: 1, porDefecto: false, despuesDelPago: false,
    });
  });

  it("un promedio menor a 3 min (datos de pruebas) no es confiable y usa el valor fijo", () => {
    expect(estimarTiempoRestante("PENDING", 40_000, null, ahora)).toEqual({
      minutos: MINUTOS_PREPARACION_POR_DEFECTO, porDefecto: true, despuesDelPago: true,
    });
  });

  it("esperando pago: el tiempo completo empieza después de pagar", () => {
    expect(estimarTiempoRestante("PENDING", doceMinutos, null, ahora)).toEqual({
      minutos: 12, porDefecto: false, despuesDelPago: true,
    });
  });

  it.each(["READY", "DELIVERED", "CANCELLED"] as const)("no muestra tiempo estimado cuando el pedido está %s", (estado) => {
    expect(estimarTiempoRestante(estado, doceMinutos, pagado.creadoEn, ahora)).toBeNull();
  });

  it("toma la primera entrada a cocina como inicio", () => {
    const deshecho: EventoEstado = { desde: "READY", hacia: "IN_PROGRESS", creadoEn: "2026-11-17T17:59:00.000Z" };
    expect(inicioEnCocina([deshecho, listo, pagado, enviado])).toBe(pagado.creadoEn);
    expect(inicioEnCocina([enviado])).toBeNull();
  });
});

describe("US-092: texto del tiempo estimado", () => {
  it.each([
    [{ minutos: 15, porDefecto: true, despuesDelPago: true }, "Estará listo aprox. 15 min después de pagar"],
    [{ minutos: 10, porDefecto: true, despuesDelPago: false }, "Faltan aprox. 10 min"],
    [{ minutos: 7, porDefecto: false, despuesDelPago: false }, "Faltan unos 7 min (promedio de la cocina)"],
    [{ minutos: 1, porDefecto: false, despuesDelPago: false }, "Ya casi está"],
  ])("%o → %s", (estimado, texto) => {
    expect(textoTiempoEstimado(estimado)).toBe(texto);
  });
});
