import { describe, expect, it } from "vitest";
import {
  crearEstadoStock,
  crearSugerenciasStock,
  rellenarStockConPrediccion,
  editarCantidadStock,
  deshacerRellenoStock,
} from "../../src/features/carta/rellenar-stock-logica";
import type {
  PrediccionPlato,
} from "../../src/features/dashboard/prediccion-logica";

const fecha = "2026-11-17";

function prediccion(
  productoId: string,
  cantidadPrevista: number,
  cambios: Partial<PrediccionPlato> = {},
): PrediccionPlato {
  return {
    productoId,
    nombre: productoId,
    cantidadPrevista,
    fecha,
    modelo: "modelo-v1",
    creadoEn: "2026-11-16T17:00:00Z",
    ...cambios,
  };
}

function estado() {
  return crearEstadoStock([
    { id: "p1", name: "Ceviche", cantidad: 30, vendidos: 0 },
    { id: "p2", name: "Bebida", cantidad: 12, vendidos: 0 },
  ]);
}

function sugerencias(cantidad = 46) {
  return crearSugerenciasStock(
    [prediccion("p1", cantidad)],
    fecha,
  );
}

describe("US-104: relleno de stock", () => {
  it("conserva los valores registrados al abrir", () => {
    expect(estado().campos.map(campo => campo.valor))
      .toEqual(["30", "12"]);
    expect(estado().anteriores).toBeNull();
  });

  it("un producto sin límite inicia vacío", () => {
    const inicial = crearEstadoStock([
      { id: "p", name: "Plato", cantidad: null, vendidos: 0 },
    ]);

    expect(inicial.campos[0].valor).toBe("");
  });

  it("rellena cantidades y marca su procedencia", () => {
    const resultado = rellenarStockConPrediccion(
      estado(),
      sugerencias(),
    );

    expect(resultado.campos[0]).toMatchObject({
      valor: "46",
      origen: "prediccion",
    });
    expect(resultado.anteriores?.[0].valor).toBe("30");
  });

  it("sin predicción queda vacío si no tiene ventas", () => {
    const resultado = rellenarStockConPrediccion(
      estado(),
      sugerencias(),
    );

    expect(resultado.campos[1]).toMatchObject({
      valor: "",
      origen: "sin_prediccion",
    });
  });

  it("sin predicciones no altera campos ni habilita deshacer", () => {
    const inicial = estado();

    expect(rellenarStockConPrediccion(inicial, []))
      .toBe(inicial);
    expect(crearSugerenciasStock([], fecha)).toEqual([]);
  });

  it("no borra campos por predicciones de otros productos", () => {
    const inicial = estado();
    const otras = crearSugerenciasStock(
      [prediccion("otro", 20)],
      fecha,
    );

    expect(rellenarStockConPrediccion(inicial, otras))
      .toBe(inicial);
  });

  it.each([
    [46.4, "46"],
    [46.5, "47"],
    [0.1, "0"],
    [0, "0"],
  ])("redondea %s a %s", (cantidad, esperado) => {
    const resultado = rellenarStockConPrediccion(
      estado(),
      sugerencias(cantidad),
    );

    expect(resultado.campos[0].valor).toBe(esperado);
  });

  it("calcula el rango orientativo sin bajar de cero", () => {
    expect(sugerencias()[0]).toMatchObject({
      cantidad: 46,
      minimo: 41,
      maximo: 51,
    });

    expect(sugerencias(2)[0]).toMatchObject({
      minimo: 0,
      maximo: 7,
    });
  });

  it("limita el rango al máximo entero permitido", () => {
    expect(sugerencias(2147483647)[0].maximo)
      .toBe(2147483647);
  });

  it("recupera más de tres productos previstos", () => {
    const previstas = [1, 2, 3, 4, 5].map(
      i => prediccion(`p${i}`, i),
    );

    expect(crearSugerenciasStock(previstas, fecha))
      .toHaveLength(5);
  });

  it("usa la fecha solicitada y prioriza el modelo real", () => {
    const resultado = crearSugerenciasStock([
      prediccion("p1", 46),
      prediccion("p1", 99, { modelo: "otro-demo" }),
      prediccion("p2", 20, { fecha: "2026-11-18" }),
    ], fecha);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].cantidad).toBe(46);
  });

  it("la edición manual marca editado sin modificar el estado anterior", () => {
    const rellenado = rellenarStockConPrediccion(
      estado(),
      sugerencias(),
    );

    const editado = editarCantidadStock(
      rellenado,
      "p1",
      "50",
    );

    expect(editado.campos[0]).toMatchObject({
      valor: "50",
      origen: "editado",
    });
    expect(rellenado.campos[0].valor).toBe("46");
  });

  it("deshacer recupera valores y marcas anteriores", () => {
    const inicial = editarCantidadStock(
      estado(),
      "p1",
      "35",
    );

    const rellenado = rellenarStockConPrediccion(
      inicial,
      sugerencias(),
    );

    const editado = editarCantidadStock(
      rellenado,
      "p1",
      "60",
    );

    expect(deshacerRellenoStock(editado)).toEqual(inicial);
  });

  it("deshacer sin relleno previo no altera nada", () => {
    const inicial = estado();
    expect(deshacerRellenoStock(inicial)).toBe(inicial);
  });

  it("deshace el relleno más reciente", () => {
    const primero = rellenarStockConPrediccion(
      estado(),
      sugerencias(),
    );

    const editado = editarCantidadStock(
      primero,
      "p1",
      "50",
    );

    const segundo = rellenarStockConPrediccion(
      editado,
      sugerencias(),
    );

    expect(deshacerRellenoStock(segundo).campos)
      .toEqual(editado.campos);
  });

  it("conserva el stock sin predicción cuando ya hay ventas", () => {
    const inicial = crearEstadoStock([
      { id: "p1", name: "Ceviche", cantidad: 30, vendidos: 0 },
      { id: "p2", name: "Bebida", cantidad: 12, vendidos: 3 },
    ]);

    const resultado = rellenarStockConPrediccion(
      inicial,
      sugerencias(),
    );

    expect(resultado.campos[1]).toMatchObject({
      valor: "12",
      origen: "registrado",
    });
  });

  it("no infla una predicción inferior a lo vendido", () => {
    const inicial = crearEstadoStock([
      { id: "p1", name: "Ceviche", cantidad: 30, vendidos: 10 },
    ]);

    const resultado = rellenarStockConPrediccion(
      inicial,
      sugerencias(5),
    );

    // Debe ajustarse antes de guardar; se mantiene la validación existente.
    expect(resultado.campos[0].valor).toBe("5");
  });

  it("no modifica el estado ni las sugerencias recibidas", () => {
    const inicial = estado();
    const previstas = sugerencias();
    const copia = structuredClone({ inicial, previstas });

    const rellenado = rellenarStockConPrediccion(
      inicial,
      previstas,
    );

    deshacerRellenoStock(
      editarCantidadStock(rellenado, "p1", "50"),
    );

    expect({ inicial, previstas }).toEqual(copia);
  });

  it.each([
    -1,
    NaN,
    Infinity,
    2147483648,
  ])("rechaza la predicción inválida %s", cantidad => {
    expect(() => sugerencias(cantidad)).toThrow();
  });

  it("rechaza productos duplicados", () => {
    const producto = {
      id: "p1",
      name: "Ceviche",
      cantidad: 30,
      vendidos: 0,
    };

    expect(() => crearEstadoStock([producto, producto]))
      .toThrow();
  });

  it("rechaza editar un producto ajeno al formulario", () => {
    expect(() =>
      editarCantidadStock(estado(), "otro", "50"),
    ).toThrow();
  });
});