import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TarjetaPrediccion } from "../../src/features/dashboard/tarjeta-prediccion";
import type { ResumenPrediccion } from "../../src/features/dashboard/prediccion";

function resumen(cambios: Partial<ResumenPrediccion> = {}): ResumenPrediccion {
  return {
    fecha: "2026-11-15", dia: "domingo", modelo: "modelo-v1", esDemo: false,
    platos: [{ productoId: "p1", nombre: "Ceviche clásico", cantidadPrevista: 46,
      stockRegistrado: null, faltantes: 0, alerta: false }],
    ...cambios,
  };
}

function mostrar(datos: ResumenPrediccion) {
  return renderToStaticMarkup(createElement(TarjetaPrediccion, { resultado: { ok: true, resumen: datos } }));
}

describe("US-090: tarjeta de predicción", () => {
  it("muestra el día, la cantidad y el plato previstos", () => {
    const html = mostrar(resumen());
    expect(html).toContain("Mañana domingo: prepara ~46 Ceviche clásico");
    expect(html).toContain("2026-11-15");
  });

  it("sin predicción muestra el mensaje vacío", () => {
    const html = mostrar(resumen({ platos: [], modelo: null }));
    expect(html).toContain("Aún no hay predicción para mañana");
    expect(html).not.toContain("prepara ~");
  });

  it("una consulta fallida muestra un error y no un falso vacío", () => {
    const html = renderToStaticMarkup(createElement(TarjetaPrediccion, {
      resultado: { ok: false, mensaje: "Intenta de nuevo." },
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Intenta de nuevo.");
    expect(html).not.toContain("Aún no hay predicción");
  });

  it("muestra el faltante cuando el stock es menor", () => {
    const datos = resumen();
    datos.platos[0] = { ...datos.platos[0], stockRegistrado: 30, faltantes: 16, alerta: true };
    expect(mostrar(datos)).toContain("Stock 30 · previsto ~46: faltarían 16");
  });

  it("sin stock registrado no muestra faltantes", () => {
    const html = mostrar(resumen());
    expect(html).toContain("Sin stock registrado para ese día");
    expect(html).not.toContain("faltarían");
  });

  it.each([46, 60])("stock %s suficiente no muestra alerta", (stockRegistrado) => {
    const datos = resumen();
    datos.platos[0] = { ...datos.platos[0], stockRegistrado };
    const html = mostrar(datos);
    expect(html).toContain(`Stock ${stockRegistrado} · previsto ~46: suficiente`);
    expect(html).not.toContain("faltarían");
  });

  it("identifica explícitamente la demostración", () => {
    const html = mostrar(resumen({ esDemo: true, modelo: "modelo-v1-demo" }));
    expect(html).toContain("Predicción de demostración");
    expect(html).toContain("fechas desplazadas");
  });

  it("una predicción real no se etiqueta como demo", () => {
    expect(mostrar(resumen())).not.toContain("Predicción de demostración");
  });

  it("presenta los tres platos del resumen", () => {
    const datos = resumen();
    datos.platos = ["Ceviche clásico", "Ceviche mixto", "Leche de tigre"].map((nombre, i) => ({
      ...datos.platos[0], productoId: `p${i}`, nombre,
    }));
    expect(mostrar(datos).match(/<li /g)).toHaveLength(3);
  });
});
