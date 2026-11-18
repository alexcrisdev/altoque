import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  cargarPredicciones, leerArgumentos, leerPredicciones, prepararCarga,
} from "../../scripts/analitica/cargar-predicciones.mjs";

const restauranteId = "10000000-0000-0000-0000-000000000001";
const productoId = "50000000-0000-0000-0000-000000000001";
const otroId = "50000000-0000-0000-0000-000000000002";
const cabecera = "fecha,producto_id,producto,cantidad_prevista,modelo";
const csv = `${cabecera}\n2026-11-01,P01,Ceviche clásico,46,modelo-v1\n`;

function simularCatalogo(productos = [{ id: productoId, name: "Ceviche clásico" }]) {
  const consulta = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: productos,
      count: productos.length,
      error: null,
    }),
  };

  const upsert = vi.fn().mockResolvedValue({ error: null });

  const cliente = {
    from: vi.fn((tabla: string) => {
      if (tabla === "products") return consulta;
      if (tabla === "demand_forecasts") return { upsert };
      throw new Error("Tabla inesperada.");
    }),
  };

  return { cliente, consulta, upsert };
}

describe("US-090: argumentos del cargador", () => {
  it("por defecto es simulacro y no desplaza fechas", () => {
    expect(leerArgumentos(["--restaurante", restauranteId])).toEqual({
      ayuda: false,
      restauranteId,
      desplazarDias: 0,
      aplicar: false,
    });
  });

  it("interpreta el desplazamiento y la aplicación explícita", () => {
    expect(leerArgumentos([
      "--restaurante", restauranteId,
      "--desplazar-dias", "14",
      "--aplicar",
    ])).toMatchObject({ desplazarDias: 14, aplicar: true });
  });

  it("la ayuda no requiere credenciales ni restaurante", () => {
    expect(leerArgumentos(["--help"])).toEqual({ ayuda: true });
  });

  it.each([
    { args: [] },
    { args: ["--restaurante", "invalido"] },
  ])("rechaza un restaurante ausente o inválido: $args", ({ args }) => {
    expect(() => leerArgumentos(args)).toThrow("UUID");
  });

  it.each([
    "1.5", "NaN", "Infinity", "9007199254740992",
  ])("rechaza el desplazamiento %s", dias => {
    expect(() => leerArgumentos([
      "--restaurante", restauranteId,
      "--desplazar-dias", dias,
    ])).toThrow("entero");
  });

  it("rechaza opciones desconocidas", () => {
    expect(() => leerArgumentos([
      "--restaurante", restauranteId, "--aplicarr",
    ])).toThrow();
  });
});

describe("US-090: CSV de predicciones", () => {
  it("US-104: el CSV regenerado contiene 25 predicciones del 16 al 20/11", () => {
    const texto = readFileSync(
      new URL("../../analitica/prediccion_7_dias.csv", import.meta.url),
      "utf8",
    );
    const filas = leerPredicciones(texto);
    const fechas = [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
    ];
    const nombres = [
      "Ceviche clásico",
      "Ceviche mixto",
      "Chicharrón de pescado",
      "Chicharrón de pota",
      "Leche de tigre",
    ];

    expect(filas).toHaveLength(25);
    expect([...new Set(filas.map(fila => fila.fecha))]).toEqual(fechas);

    for (const fecha of fechas) {
      const delDia = filas.filter(fila => fila.fecha === fecha);

      expect(delDia).toHaveLength(5);
      expect(delDia.map(fila => fila.nombre).sort()).toEqual([...nombres].sort());
    }

    expect(filas.every(fila =>
      fila.modelo === "xgboost-calendario-v1" &&
      Number.isInteger(fila.cantidadPrevista) &&
      fila.cantidadPrevista >= 0
    )).toBe(true);
  });

  it("desplaza las fechas y etiqueta el modelo como demo", () => {
    const filas = leerPredicciones(csv, 14);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      fecha: "2026-11-15",
      modelo: "modelo-v1-demo",
      cantidadPrevista: 46,
    });
  });

  it("sin desplazamiento conserva el modelo y fecha originales", () => {
    expect(leerPredicciones(csv)[0]).toMatchObject({
      fecha: "2026-11-01",
      modelo: "modelo-v1",
    });
  });

  it("admite BOM, CRLF, comas y comillas escapadas en el nombre", () => {
    const texto = `\uFEFF${cabecera}\r\n2026-11-01,P01,"Ceviche, tamaño ""grande""",46,modelo-v1\r\n`;

    expect(leerPredicciones(texto)[0].nombre)
      .toBe('Ceviche, tamaño "grande"');
  });

  it.each([
    ["46.4", 46],
    ["46.5", 47],
    ["0.1", 0],
  ])("redondea %s a %s unidades", (valor, esperado) => {
    expect(
      leerPredicciones(csv.replace(",46,", `,${valor},`))[0].cantidadPrevista,
    ).toBe(esperado);
  });

  it.each([
    "", "-1", "NaN", "Infinity", "2147483648",
  ])("rechaza la cantidad %j", valor => {
    expect(() =>
      leerPredicciones(csv.replace(",46,", `,${valor},`)),
    ).toThrow("Cantidad");
  });

  it.each([
    "2026-11-31", "0000-11-01", "2026-1-01",
  ])("rechaza la fecha %s", fecha => {
    expect(() =>
      leerPredicciones(csv.replace("2026-11-01", fecha)),
    ).toThrow("Fecha");
  });

  it("rechaza un desplazamiento que excede el calendario", () => {
    expect(() =>
      leerPredicciones(csv, Number.MAX_SAFE_INTEGER),
    ).toThrow("fuera de rango");
  });

  it("rechaza filas repetidas aunque cambie el identificador del modelo", () => {
    const segunda = "2026-11-01,P99,Ceviche clásico,47,modelo-v1\n";
    expect(() => leerPredicciones(csv + segunda)).toThrow("duplicada");
  });

  it("rechaza columnas ausentes, duplicadas y comillas incompletas", () => {
    expect(() =>
      leerPredicciones(csv.replace("cantidad_prevista", "otra")),
    ).toThrow("columnas");

    expect(() =>
      leerPredicciones(csv.replace("producto_id", "producto")),
    ).toThrow("columnas");

    expect(() =>
      leerPredicciones(csv.replace("Ceviche clásico", '"Ceviche clásico')),
    ).toThrow("comillas");
  });

  it("rechaza un CSV vacío o sin predicciones", () => {
    expect(() => leerPredicciones("")).toThrow("vacío");
    expect(() => leerPredicciones(cabecera)).toThrow("no contiene");
  });
});

describe("US-090: coincidencia por nombre", () => {
  it("usa el UUID del catálogo y nunca el identificador P01 del CSV", () => {
    const resultado = prepararCarga(
      leerPredicciones(csv),
      [{ id: productoId, name: " CEVICHE   CLÁSICO " }],
      restauranteId,
    );

    expect(resultado).toEqual({
      cargas: [{
        restaurant_id: restauranteId,
        product_id: productoId,
        forecast_date: "2026-11-01",
        predicted_quantity: 46,
        model: "modelo-v1",
      }],
      incidencias: [],
    });
  });

  it("informa y omite nombres sin coincidencia", () => {
    const resultado = prepararCarga(
      leerPredicciones(csv),
      [],
      restauranteId,
    );

    expect(resultado.cargas).toEqual([]);
    expect(resultado.incidencias).toEqual([{
      fecha: "2026-11-01",
      producto: "Ceviche clásico",
      motivo: "sin coincidencia",
    }]);
  });

  it("no elige arbitrariamente entre productos con nombre ambiguo", () => {
    const resultado = prepararCarga(
      leerPredicciones(csv),
      [
        { id: productoId, name: "Ceviche clásico" },
        { id: otroId, name: "ceviche clásico" },
      ],
      restauranteId,
    );

    expect(resultado.cargas).toEqual([]);
    expect(resultado.incidencias[0].motivo).toBe("nombre ambiguo");
  });
});

describe("US-090: simulacro y aplicación con cliente simulado", () => {
  it("el simulacro solo lee productos del restaurante y nunca ejecuta upsert", async () => {
    const { cliente, consulta, upsert } = simularCatalogo();
    const informar = vi.fn();

    await cargarPredicciones(
      cliente, leerPredicciones(csv, 14), restauranteId, false, informar,
    );

    expect(consulta.eq)
      .toHaveBeenCalledExactlyOnceWith("restaurant_id", restauranteId);
    expect(cliente.from).toHaveBeenCalledExactlyOnceWith("products");
    expect(upsert).not.toHaveBeenCalled();
    expect(informar).toHaveBeenCalledWith("Modo: SIMULACRO (sin escrituras)");
    expect(informar).toHaveBeenCalledWith(
      expect.stringContaining("2026-11-15"),
    );
  });

  it("la aplicación explícita usa un solo upsert con la clave única", async () => {
    const { cliente, upsert } = simularCatalogo();
    const filas = leerPredicciones(csv, 14);
    const esperado = prepararCarga(
      filas,
      [{ id: productoId, name: "Ceviche clásico" }],
      restauranteId,
    );

    await cargarPredicciones(
      cliente, filas, restauranteId, true, vi.fn(),
    );

    expect(upsert).toHaveBeenCalledExactlyOnceWith(esperado.cargas, {
      onConflict: "restaurant_id,product_id,forecast_date,model",
      defaultToNull: false,
    });
  });

  it("sin coincidencias no escribe aunque se solicite aplicar", async () => {
    const { cliente, upsert } = simularCatalogo([]);

    await cargarPredicciones(
      cliente, leerPredicciones(csv), restauranteId, true, vi.fn(),
    );

    expect(upsert).not.toHaveBeenCalled();
  });

  it("continúa la paginación aunque lleguen menos de 500 productos", async () => {
    const { cliente, consulta } = simularCatalogo();

    consulta.range.mockResolvedValueOnce({
      data: [{ id: productoId, name: "Ceviche clásico" }],
      count: 2,
      error: null,
    });
    consulta.range.mockResolvedValueOnce({
      data: [{ id: otroId, name: "Ceviche mixto" }],
      count: 2,
      error: null,
    });

    await cargarPredicciones(
      cliente, leerPredicciones(csv), restauranteId, false, vi.fn(),
    );

    expect(consulta.range.mock.calls).toEqual([[0, 499], [1, 500]]);
  });

  it("una consulta fallida no se confunde con un catálogo vacío", async () => {
    const { cliente, consulta, upsert } = simularCatalogo();

    consulta.range.mockResolvedValue({
      data: null,
      error: { code: "XX001" },
      count: null,
    });

    await expect(
      cargarPredicciones(
        cliente, leerPredicciones(csv), restauranteId, true, vi.fn(),
      ),
    ).rejects.toThrow("catálogo completo");

    expect(upsert).not.toHaveBeenCalled();
  });

  it("informa un error de escritura sin declarar que se completó", async () => {
    const { cliente, upsert } = simularCatalogo();
    const informar = vi.fn();

    upsert.mockResolvedValue({ error: { code: "42501" } });

    await expect(
      cargarPredicciones(
        cliente, leerPredicciones(csv), restauranteId, true, informar,
      ),
    ).rejects.toThrow("No se pudieron guardar");

    expect(
      informar.mock.calls.some(([mensaje]) =>
        String(mensaje).startsWith("Upsert completado")
      ),
    ).toBe(false);
  });
});
