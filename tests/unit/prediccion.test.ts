import { describe, expect, it } from "vitest";
import {
  compararStockConPrediccion, fechaMananaLima, nombreDiaPrediccion,
  redondearCantidadPrevista, topPlatosPrevistos, type PrediccionPlato,
} from "../../src/features/dashboard/prediccion-logica";

const fecha = "2026-11-15";
function prediccion(cambios: Partial<PrediccionPlato> = {}): PrediccionPlato {
  return {
    productoId: "p1", nombre: "Ceviche clásico", fecha,
    cantidadPrevista: 46, modelo: "modelo-v1", creadoEn: "2026-11-14T18:00:00Z",
    ...cambios,
  };
}

describe("US-090: fecha de mañana en Lima", () => {
  it("antes de medianoche en Lima no adelanta la fecha por estar en UTC", () => {
    expect(fechaMananaLima(new Date("2026-11-15T04:59:59Z"))).toBe("2026-11-15");
  });
  it("desde medianoche en Lima calcula el día siguiente", () => {
    expect(fechaMananaLima(new Date("2026-11-15T05:00:00Z"))).toBe("2026-11-16");
  });
  it("resuelve el cambio de mes y año", () => {
    expect(fechaMananaLima(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });
  it("conserva el día bisiesto", () => {
    expect(fechaMananaLima(new Date("2028-02-28T18:00:00Z"))).toBe("2028-02-29");
  });
  it("obtiene el nombre correcto del día", () => {
    expect(nombreDiaPrediccion(fecha)).toBe("domingo");
  });
  it("rechaza fechas inválidas", () => {
    expect(() => fechaMananaLima(new Date("invalida"))).toThrow("fecha actual");
    expect(() => nombreDiaPrediccion("2026-02-30")).toThrow("fecha");
  });
});

describe("US-090: comparación stock contra predicción", () => {
  it.each([null, undefined])("sin stock registrado (%s) no alerta", stock => {
    expect(compararStockConPrediccion(stock, 46)).toEqual({
      stockRegistrado: null, cantidadPrevista: 46, faltantes: 0, alerta: false,
    });
  });
  it("stock menor muestra las unidades que faltarían", () => {
    expect(compararStockConPrediccion(30, 46)).toEqual({
      stockRegistrado: 30, cantidadPrevista: 46, faltantes: 16, alerta: true,
    });
  });
  it.each([46, 60])("stock igual o mayor (%s) no alerta", stock => {
    expect(compararStockConPrediccion(stock, 46)).toMatchObject({ faltantes: 0, alerta: false });
  });
  it("stock cero sí alerta cuando existe demanda prevista", () => {
    expect(compararStockConPrediccion(0, 46)).toMatchObject({ faltantes: 46, alerta: true });
  });
  it("demanda prevista cero no genera alerta", () => {
    expect(compararStockConPrediccion(0, 0)).toMatchObject({ faltantes: 0, alerta: false });
  });
  it("redondea la predicción antes de comparar y calcular el faltante", () => {
    expect(compararStockConPrediccion(46, 46.5)).toMatchObject({ cantidadPrevista: 47, faltantes: 1, alerta: true });
    expect(compararStockConPrediccion(46, 46.4)).toMatchObject({ cantidadPrevista: 46, faltantes: 0, alerta: false });
  });
  it.each([-1, 1.5, NaN, Infinity, 2147483648])("rechaza el stock inválido %s", stock => {
    expect(() => compararStockConPrediccion(stock, 46)).toThrow("stock");
  });
  it.each([-1, NaN, Infinity, 2147483648])("rechaza la cantidad prevista inválida %s", cantidad => {
    expect(() => redondearCantidadPrevista(cantidad)).toThrow("cantidad prevista");
  });
});

describe("US-090: top N platos previstos de una fecha", () => {
  it("sin predicciones devuelve una lista vacía", () => {
    expect(topPlatosPrevistos([], fecha)).toEqual([]);
  });
  it("devuelve los tres mayores sin sumar modelos ni unidades", () => {
    const filas = [46, 12, 30, 55].map((cantidadPrevista, i) => prediccion({
      productoId: `p${i}`, nombre: `Plato ${i}`, cantidadPrevista,
    }));
    expect(topPlatosPrevistos(filas, fecha).map(fila => fila.cantidadPrevista)).toEqual([55, 46, 30]);
  });
  it("respeta el límite solicitado para reutilizarlo en US-089", () => {
    expect(topPlatosPrevistos([
      prediccion(), prediccion({ productoId: "p2", cantidadPrevista: 30 }),
    ], fecha, 1)).toHaveLength(1);
  });
  it("ignora las predicciones de otras fechas", () => {
    expect(topPlatosPrevistos([prediccion({ fecha: "2026-11-16" })], fecha)).toEqual([]);
  });
  it("resuelve empates alfabéticamente y luego por ID", () => {
    const filas = [
      prediccion({ productoId: "p3", nombre: "Tiradito" }),
      prediccion({ productoId: "p2", nombre: "Ceviche" }),
      prediccion({ productoId: "p1", nombre: "Ceviche" }),
    ];
    expect(topPlatosPrevistos(filas, fecha).map(fila => fila.productoId)).toEqual(["p1", "p2", "p3"]);
  });
  it("entre modelos reales selecciona el más reciente sin mezclarlos", () => {
    const filas = [
      prediccion({ modelo: "viejo", cantidadPrevista: 100 }),
      prediccion({ modelo: "nuevo", cantidadPrevista: 30, creadoEn: "2026-11-14T19:00:00Z" }),
      prediccion({ productoId: "p2", modelo: "viejo", cantidadPrevista: 90 }),
    ];
    expect(topPlatosPrevistos(filas, fecha).map(fila => [fila.modelo, fila.cantidadPrevista])).toEqual([["nuevo", 30]]);
  });
  it("prioriza una predicción real frente a una demo más reciente", () => {
    const filas = [prediccion(), prediccion({ modelo: "otro-demo", creadoEn: "2026-11-14T20:00:00Z" })];
    expect(topPlatosPrevistos(filas, fecha)[0].modelo).toBe("modelo-v1");
  });
  it("permite mostrar la demo cuando no existe una predicción real", () => {
    expect(topPlatosPrevistos([prediccion({ modelo: "modelo-v1-demo" })], fecha)[0].modelo).toBe("modelo-v1-demo");
  });
  it("desempata versiones de la misma fecha de creación por modelo", () => {
    const filas = [prediccion({ modelo: "modelo-b" }), prediccion({ modelo: "modelo-a" })];
    expect(topPlatosPrevistos(filas, fecha)[0].modelo).toBe("modelo-a");
  });
  it("no combina fechas de creación de otras zonas incorrectamente", () => {
    const filas = [
      prediccion({ modelo: "primero", creadoEn: "2026-11-14T18:00:00Z" }),
      prediccion({ modelo: "segundo", creadoEn: "2026-11-14T14:00:00-05:00" }),
    ];
    expect(topPlatosPrevistos(filas, fecha)[0].modelo).toBe("segundo");
  });
  it("redondea al entero antes de ordenar", () => {
    const filas = [prediccion({ nombre: "Zeta", cantidadPrevista: 46.4 }),
      prediccion({ productoId: "p2", nombre: "Alfa", cantidadPrevista: 46.1 })];
    expect(topPlatosPrevistos(filas, fecha).map(fila => [fila.nombre, fila.cantidadPrevista]))
      .toEqual([["Alfa", 46], ["Zeta", 46]]);
  });
  it("no modifica el arreglo ni los objetos recibidos", () => {
    const fila = Object.freeze(prediccion({ cantidadPrevista: 46.5 }));
    const filas = Object.freeze([fila]);
    expect(topPlatosPrevistos(filas, fecha)[0].cantidadPrevista).toBe(47);
    expect(fila.cantidadPrevista).toBe(46.5);
  });
  it("rechaza duplicados del mismo producto y modelo", () => {
    expect(() => topPlatosPrevistos([prediccion(), prediccion()], fecha)).toThrow("duplicadas");
  });
  it.each([0, -1, 1.5, Infinity])("rechaza el límite %s", limite => {
    expect(() => topPlatosPrevistos([], fecha, limite)).toThrow("límite");
  });
  it.each(["2026-11-31", "0000-01-01", "invalida"])("rechaza la fecha %s", valor => {
    expect(() => topPlatosPrevistos([], valor)).toThrow("fecha");
  });
  it("rechaza predicciones incompletas o con creación sin zona", () => {
    for (const cambios of [
      { nombre: "" }, { productoId: "" }, { modelo: "" },
      { creadoEn: "2026-11-14T18:00:00" }, { creadoEn: "2026-02-30T18:00:00Z" },
    ]) {
      expect(() => topPlatosPrevistos([prediccion(cambios)], fecha)).toThrow();
    }
  });
});
