import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
import { crearClienteServidor } from "../../src/lib/supabase/server";
import { obtenerPrediccionManana } from "../../src/features/dashboard/prediccion";

const restauranteId = "restaurante-autorizado";
const ahora = new Date("2026-11-14T18:00:00Z");
const fecha = "2026-11-15";
type Fila = {
  id: string; product_id: string; forecast_date: string; predicted_quantity: number;
  model: string; created_at: string; producto: { name: string } | null;
};
type Respuesta = { data: Fila[] | null; count: number | null; error: { code: string } | null };
function fila(cambios: Partial<Fila> = {}): Fila {
  return { id: "f1", product_id: "p1", forecast_date: fecha, predicted_quantity: 46,
    model: "modelo-v1-demo", created_at: "2026-11-14T17:00:00Z", producto: { name: "Ceviche" }, ...cambios };
}

function simular(respuestas: Respuesta[] = [{ data: [fila()], count: 1, error: null }]) {
  const predicciones = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(), overrideTypes: vi.fn(),
  };
  for (const respuesta of respuestas) predicciones.overrideTypes.mockResolvedValueOnce(respuesta);
  const stock = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockResolvedValue({ data: [], error: null }) };
  const cliente = { from: vi.fn((tabla: string) => {
    if (tabla === "demand_forecasts") return predicciones;
    if (tabla === "product_daily_stock") return stock;
    throw new Error("Tabla inesperada.");
  }) };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>);
  return { cliente, predicciones, stock };
}

beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("US-090: lectura de predicciones y stock de mañana", () => {
  it("consulta con sesión, restaurante y fecha de mañana; calcula la alerta", async () => {
    const { cliente, predicciones, stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: [{ product_id: "p1", quantity: 30 }], error: null });
    expect(await obtenerPrediccionManana(restauranteId, ahora)).toEqual({
      fecha, dia: "domingo", modelo: "modelo-v1-demo", esDemo: true,
      platos: [{ productoId: "p1", nombre: "Ceviche", cantidadPrevista: 46,
        stockRegistrado: 30, faltantes: 16, alerta: true }],
    });
    expect(crearClienteServidor).toHaveBeenCalledTimes(1);
    expect(predicciones.eq.mock.calls).toEqual([["restaurant_id", restauranteId], ["forecast_date", fecha]]);
    expect(predicciones.select).toHaveBeenCalledWith(expect.stringContaining("demand_forecasts_product_restaurant_fkey"), { count: "exact" });
    expect(predicciones.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(stock.eq.mock.calls).toEqual([["restaurant_id", restauranteId], ["stock_date", fecha]]);
    expect(stock.in).toHaveBeenCalledExactlyOnceWith("product_id", ["p1"]);
    expect(cliente.from.mock.calls.map(([tabla]) => tabla)).toEqual(["demand_forecasts", "product_daily_stock"]);
  });

  it("selecciona solo el top 3 del modelo real y consulta únicamente su stock", async () => {
    const datos = [fila({ id: "demo", model: "demo-demo", predicted_quantity: 100 }),
      ...[10, 50, 30, 40].map((cantidad, i) => fila({ id: `f${i}`, product_id: `p${i}`,
        model: "real-v1", predicted_quantity: cantidad, producto: { name: `Plato ${i}` } }))];
    const { stock } = simular([{ data: datos, count: datos.length, error: null }]);
    const resultado = await obtenerPrediccionManana(restauranteId, ahora);
    expect(resultado).toMatchObject({ modelo: "real-v1", esDemo: false });
    expect(resultado.platos.map(plato => plato.cantidadPrevista)).toEqual([50, 40, 30]);
    expect(stock.in).toHaveBeenCalledWith("product_id", ["p1", "p3", "p2"]);
  });

  it("sin stock de esa fecha conserva la predicción y no genera alerta", async () => {
    simular();
    expect((await obtenerPrediccionManana(restauranteId, ahora)).platos[0])
      .toMatchObject({ stockRegistrado: null, faltantes: 0, alerta: false, cantidadPrevista: 46 });
  });

  it("sin predicciones devuelve vacío y no consulta stock", async () => {
    const { cliente } = simular([{ data: [], count: 0, error: null }]);
    expect(await obtenerPrediccionManana(restauranteId, ahora)).toEqual({
      fecha, dia: "domingo", modelo: null, esDemo: false, platos: [],
    });
    expect(cliente.from).toHaveBeenCalledExactlyOnceWith("demand_forecasts");
  });

  it("un error de predicciones no se confunde con ausencia de datos", async () => {
    simular([{ data: null, count: null, error: { code: "42P01" } }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("No se pudieron consultar");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("obtenerPrediccionManana", "42P01");
  });

  it("un error de stock no se confunde con stock ilimitado", async () => {
    const { stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: null, error: { code: "XX001" } });
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("stock");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("obtenerPrediccionManana:stock", "XX001");
  });

  it.each([null, NaN, -1, 1.5])("rechaza el conteo incompleto %s", count => {
    simular([{ data: [], count, error: null }]);
    return expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("incompleta");
  });

  it("agrupa páginas antes de calcular el top", async () => {
    const { predicciones } = simular([
      { data: [fila()], count: 2, error: null },
      { data: [fila({ id: "f2", product_id: "p2", predicted_quantity: 60 })], count: 2, error: null },
    ]);
    expect((await obtenerPrediccionManana(restauranteId, ahora)).platos.map(plato => plato.cantidadPrevista))
      .toEqual([60, 46]);
    expect(predicciones.range.mock.calls).toEqual([[0, 499], [1, 500]]);
  });

  it("no devuelve datos parciales si cambia el conteo entre páginas", async () => {
    simular([{ data: [fila()], count: 2, error: null },
      { data: [fila({ id: "f2" })], count: 3, error: null }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("cambiaron");
  });

  it("rechaza una página vacía mientras faltan predicciones", async () => {
    simular([{ data: [], count: 1, error: null }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("Faltan");
  });

  it("rechaza filas duplicadas entre páginas", async () => {
    simular([{ data: [fila()], count: 2, error: null }, { data: [fila()], count: 2, error: null }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("inconsistentes");
  });

  it("rechaza una predicción sin producto relacionado", async () => {
    simular([{ data: [fila({ producto: null })], count: 1, error: null }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("inconsistentes");
  });

  it.each([-1, undefined])("rechaza stock incompleto o inválido: %s", quantity => {
    const { stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: [{ product_id: "p1", quantity }], error: null });
    return expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow(/stock/);
  });

  it("rechaza stock duplicado", async () => {
    const { stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: [
      { product_id: "p1", quantity: 30 }, { product_id: "p1", quantity: 30 },
    ], error: null });
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("inconsistente");
  });

  it("no consulta sin restaurante", async () => {
    await expect(obtenerPrediccionManana(" ", ahora)).rejects.toThrow("restaurante");
    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("no consulta con una fecha actual inválida", async () => {
    await expect(obtenerPrediccionManana(restauranteId, new Date("invalida"))).rejects.toThrow("fecha");
    expect(crearClienteServidor).not.toHaveBeenCalled();
  });

  it("rechaza una fila que no corresponde a mañana", async () => {
    simular([{ data: [fila({ forecast_date: "2026-11-14" })], count: 1, error: null }]);
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("inconsistentes");
  });

  it("rechaza stock de un producto fuera del top consultado", async () => {
    const { stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: [{ product_id: "ajeno", quantity: 30 }], error: null });
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("inconsistente");
  });

  it("rechaza una respuesta nula de stock", async () => {
    const { stock } = simular();
    stock.overrideTypes.mockResolvedValue({ data: null, error: null });
    await expect(obtenerPrediccionManana(restauranteId, ahora)).rejects.toThrow("incompleta");
  });
});
