import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerTiemposCocina } from "../../src/features/dashboard/tiempos-cocina";
import {
  calcularTiemposPorEtapa, type EventoCocina, type PedidoCocina,
} from "../../src/features/dashboard/tiempos-cocina-logica";

const dia = "2026-11-12";
const minuto = 60_000;

function pedido(id: string, platos: string[], status = "DELIVERED"): PedidoCocina {
  return { id, status, order_items: platos.map((product_name) => ({ product_name })) };
}

function evento(id: string, estado: string, minutos: number, cambios: Partial<EventoCocina> = {}): EventoCocina {
  return {
    order_id: id,
    to_status: estado,
    event: "STATUS",
    created_at: new Date(Date.parse(`${dia}T05:00:00Z`) + minutos * minuto).toISOString(),
    ...cambios,
  };
}

function pago(id: string, minutos: number) {
  return evento(id, "IN_PROGRESS", minutos, { from_status: "PENDING", reason: "US-097: pago Checkout" });
}

const sinDatos = { pedidos: 0, medianaMs: null, p90Ms: null };

describe("US-113: tiempos por etapa", () => {
  it("calcula mediana y P90 de las tres etapas y ordena los platos por mediana de preparación", () => {
    const pedidos = Array.from({ length: 10 }, (_, i) => pedido(`p${i}`,
      i < 5 ? ["Ajiaco", "Ajiaco"] : ["Ceviche"]));
    const marcas = pedidos.flatMap(({ id }, i) => {
      const espera = i + 1;
      return [
        evento(id, "PENDING", 0), pago(id, espera),
        evento(id, "READY", espera * 3), evento(id, "DELIVERED", espera * 6),
      ];
    });

    const resumen = calcularTiemposPorEtapa(pedidos, marcas.toReversed(), dia, dia);
    expect(resumen.pago).toEqual({ pedidos: 10, medianaMs: 5.5 * minuto, p90Ms: 9 * minuto });
    expect(resumen.preparacion).toEqual({ pedidos: 10, medianaMs: 11 * minuto, p90Ms: 18 * minuto });
    expect(resumen.entrega).toEqual({ pedidos: 10, medianaMs: 16.5 * minuto, p90Ms: 27 * minuto });
    expect(resumen.porPlato).toEqual([
      { nombre: "Ceviche", pedidos: 5, medianaMs: 16 * minuto, p90Ms: 20 * minuto },
      { nombre: "Ajiaco", pedidos: 5, medianaMs: 6 * minuto, p90Ms: 10 * minuto },
    ]);
  });

  it("omite solo la etapa incompleta y descarta todo el pedido cancelado", () => {
    const resumen = calcularTiemposPorEtapa([
      pedido("incompleto", ["Ceviche"]), pedido("cancelado", ["Sopa"], "CANCELLED"),
      pedido("solo-entrega", ["Arroz"]),
    ], [
      pago("incompleto", 0), evento("incompleto", "READY", 10),
      evento("incompleto", "DELIVERED", 20, { created_at: "inválida" }),
      evento("cancelado", "PENDING", 0), pago("cancelado", 5),
      evento("cancelado", "READY", 30), evento("cancelado", "DELIVERED", 50),
      evento("solo-entrega", "READY", 7), evento("solo-entrega", "DELIVERED", 8),
    ], dia, dia);
    expect(resumen.pago).toEqual(sinDatos);
    expect(resumen.preparacion).toEqual({ pedidos: 1, medianaMs: 10 * minuto, p90Ms: 10 * minuto });
    expect(resumen.entrega).toEqual({ pedidos: 1, medianaMs: minuto, p90Ms: minuto });
    expect(resumen.porPlato.map(({ nombre }) => nombre)).toEqual(["Ceviche"]);
  });

  it("usa el inicio de cada etapa en Lima y acepta el final fuera del rango", () => {
    const resumen = calcularTiemposPorEtapa([pedido("cruce", ["Ceviche"])], [
      evento("cruce", "PENDING", -5), pago("cruce", 0),
      evento("cruce", "READY", 1435), evento("cruce", "DELIVERED", 1445),
    ], dia, dia);
    expect(resumen.pago).toEqual(sinDatos);
    expect(resumen.preparacion.medianaMs).toBe(1435 * minuto);
    expect(resumen.entrega.medianaMs).toBe(10 * minuto);
  });

  it("omite un Listo deshecho y no atribuye al pago un cambio administrativo de estado", () => {
    const resumen = calcularTiemposPorEtapa([pedido("reabierto", ["Ceviche"], "IN_PROGRESS")], [
      evento("reabierto", "PENDING", 0),
      evento("reabierto", "IN_PROGRESS", 1, { from_status: "PENDING", reason: "US-069: ingreso directo a preparación" }),
      evento("reabierto", "READY", 2), evento("reabierto", "IN_PROGRESS", 3, { from_status: "READY" }),
    ], dia, dia);
    expect(resumen).toEqual({ pago: sinDatos, preparacion: sinDatos, entrega: sinDatos, porPlato: [] });
  });

  it("excluye los pedidos identificados por US-111 antes de consultar sus historiales", async () => {
    const pagina = (data: unknown[]) => ({ data, count: data.length, error: null });
    const respuestas = [
      pagina([{ id: "h1", order_id: "real" }, { id: "h2", order_id: "prueba" }]),
      pagina([evento("real", "PENDING", 0), pago("real", 5), evento("real", "READY", 15)]
        .map((dato, i) => ({ ...dato, id: `real-${i}` }))),
      pagina([pedido("real", ["Ceviche"], "READY")]),
    ];
    const consultas = respuestas.map((respuesta) => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue(respuesta),
    }));
    const from = vi.fn();
    for (const consulta of consultas) from.mockReturnValueOnce(consulta);
    vi.mocked(crearClienteServidor).mockResolvedValue({ from } as never);

    const resumen = await obtenerTiemposCocina("restaurante", dia, dia, new Set(["prueba"]));
    expect(consultas[0].in).toHaveBeenCalledWith("to_status", ["PENDING", "IN_PROGRESS", "READY"]);
    expect(consultas[1].in).toHaveBeenCalledWith("order_id", ["real"]);
    expect(consultas[2].in).toHaveBeenCalledWith("id", ["real"]);
    expect(resumen.etapas?.pago.pedidos).toBe(1);
  });
});
