import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StockPrueba } from "../soporte/stock-prueba";

function entorno(inicial: Record<string, { quantity: number; sold: number }> = {}) {
  const filas = new Map(Object.entries(structuredClone(inicial)));
  const fallos = new Set<string>();
  const consultas: Record<string, string>[] = [];
  const rpc = vi.fn(async (_nombre: string, args: {
    p_items: { productoId: string; cantidad: number | null }[]; p_parcial: boolean;
  }) => {
    const { productoId, cantidad } = args.p_items[0];
    if (fallos.has(productoId)) return { error: { code: "FALLO_SIMULADO" } };
    if (cantidad === null) filas.delete(productoId);
    else filas.set(productoId, { quantity: cantidad, sold: filas.get(productoId)?.sold ?? 0 });
    return { error: null };
  });
  const salir = vi.fn(async () => ({ error: null }));
  const cliente = {
    from: vi.fn(() => {
      const filtros: Record<string, string> = {};
      const consulta = {
        select: () => consulta,
        eq: (clave: string, valor: string) => { filtros[clave] = valor; return consulta; },
        maybeSingle: async () => {
          consultas.push(filtros);
          return { data: structuredClone(filas.get(filtros.product_id) ?? null), error: null };
        },
      };
      return consulta;
    }),
    rpc, auth: { signOut: salir },
  } as unknown as SupabaseClient;
  const autenticar = vi.fn(async () => cliente);
  const stock = new StockPrueba("restaurante", autenticar, () => "2026-11-16");
  return { stock, filas, rpc, salir, autenticar, consultas, fallos };
}

describe("US-098: preparación y restauración de stock", () => {
  it("prepara un plato agotado y no toca otros productos", async () => {
    const e = entorno({ plato: { quantity: 4, sold: 4 }, otro: { quantity: 20, sold: 3 } });
    await e.stock.preparar("plato", 2);
    expect(e.filas.get("plato")).toEqual({ quantity: 6, sold: 4 });
    expect(e.filas.get("otro")).toEqual({ quantity: 20, sold: 3 });
    expect(e.rpc).toHaveBeenCalledWith("guardar_stock_diario", {
      p_restaurant_id: "restaurante", p_stock_date: "2026-11-16", p_parcial: true,
      p_items: [{ productoId: "plato", cantidad: 6 }],
    });
    expect(e.consultas[0]).toEqual({ restaurant_id: "restaurante", product_id: "plato", stock_date: "2026-11-16" });
    await e.stock.restaurar();
    expect(e.filas.get("plato")).toEqual({ quantity: 4, sold: 4 });
  });

  it("devuelve la disponibilidad previa y conserva el consumo entregado", async () => {
    const e = entorno({ plato: { quantity: 5, sold: 4 } });
    await e.stock.preparar("plato", 3);
    e.filas.get("plato")!.sold += 2;
    await e.stock.restaurar();
    expect(e.filas.get("plato")).toEqual({ quantity: 7, sold: 6 });
    expect(e.salir).toHaveBeenCalledWith({ scope: "local" });
  });

  it("conserva el primer snapshot al preparar varias veces", async () => {
    const e = entorno({ plato: { quantity: 5, sold: 5 } });
    await e.stock.preparar("plato", 1);
    await e.stock.preparar("plato", 4);
    await e.stock.restaurar();
    expect(e.filas.get("plato")).toEqual({ quantity: 5, sold: 5 });
  });

  it("no limita un producto originalmente ilimitado", async () => {
    const e = entorno();
    await e.stock.preparar("plato", 2);
    expect(e.rpc.mock.calls[0][1].p_items).toEqual([{ productoId: "plato", cantidad: null }]);
    await e.stock.restaurar();
    expect(e.filas.has("plato")).toBe(false);
  });

  it("retira el límite temporal después de cancelar los pedidos propios", async () => {
    const e = entorno();
    await e.stock.preparar("plato", 2, { limitar: true });
    await e.stock.restaurar();
    expect(e.filas.has("plato")).toBe(false);
  });

  it("no elimina ventas al restaurar un límite temporal y permite reintentar", async () => {
    const e = entorno();
    await e.stock.preparar("plato", 2, { limitar: true });
    e.filas.get("plato")!.sold = 1;
    await expect(e.stock.restaurar()).rejects.toThrow("Cancela o elimina primero");
    expect(e.filas.get("plato")!.sold).toBe(1);
    e.filas.get("plato")!.sold = 0;
    await e.stock.restaurar();
    expect(e.filas.has("plato")).toBe(false);
    expect(e.autenticar).toHaveBeenCalledTimes(2);
  });

  it("restaura los demás productos aunque uno falle y avisa del pendiente", async () => {
    const e = entorno({ a: { quantity: 1, sold: 1 }, b: { quantity: 2, sold: 2 } });
    await e.stock.preparar("a", 3);
    await e.stock.preparar("b", 3);
    e.fallos.add("a");
    await expect(e.stock.restaurar()).rejects.toThrow("Restauración de stock pendiente");
    expect(e.filas.get("b")).toEqual({ quantity: 2, sold: 2 });
    expect(e.salir).toHaveBeenCalledOnce();
  });

  it("ejecuta la restauración desde finally cuando la prueba falla", async () => {
    const e = entorno({ plato: { quantity: 2, sold: 2 } });
    await expect((async () => {
      try {
        await e.stock.preparar("plato", 3);
        throw new Error("Fallo de la prueba");
      } finally { await e.stock.restaurar(); }
    })()).rejects.toThrow("Fallo de la prueba");
    expect(e.filas.get("plato")).toEqual({ quantity: 2, sold: 2 });
  });

  it("mantiene un snapshot aunque falle la preparación", async () => {
    const e = entorno({ plato: { quantity: 2, sold: 2 } });
    e.fallos.add("plato");
    await expect(e.stock.preparar("plato", 3)).rejects.toThrow("Stock US-098");
    e.fallos.clear();
    await e.stock.restaurar();
    expect(e.filas.get("plato")).toEqual({ quantity: 2, sold: 2 });
  });

  it("permite fijar la última unidad sin reiniciar vendidos", async () => {
    const e = entorno({ plato: { quantity: 100, sold: 7 } });
    await e.stock.preparar("plato", 1, { exacto: true });
    expect(e.filas.get("plato")).toEqual({ quantity: 8, sold: 7 });
    await e.stock.restaurar();
    expect(e.filas.get("plato")).toEqual({ quantity: 100, sold: 7 });
  });

  it("rechaza cantidades inválidas antes de autenticar", async () => {
    const e = entorno();
    await expect(e.stock.preparar("plato", -1)).rejects.toThrow("inválida");
    await expect(e.stock.preparar("plato", 1.5)).rejects.toThrow("inválida");
    expect(e.autenticar).not.toHaveBeenCalled();
  });

  it("puede repetirse sin agotar la disponibilidad previa", async () => {
    const e = entorno({ plato: { quantity: 8, sold: 6 } });
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      await e.stock.preparar("plato", 3);
      e.filas.get("plato")!.sold += 3;
      await e.stock.restaurar();
      const fila = e.filas.get("plato")!;
      expect(fila.quantity - fila.sold).toBe(2);
    }
    expect(e.filas.get("plato")).toEqual({ quantity: 14, sold: 12 });
  });

  it("no conecta cuando la fixture no usó platos y restaurar es idempotente", async () => {
    const e = entorno();
    await e.stock.restaurar();
    await e.stock.restaurar();
    expect(e.autenticar).not.toHaveBeenCalled();
  });
});
