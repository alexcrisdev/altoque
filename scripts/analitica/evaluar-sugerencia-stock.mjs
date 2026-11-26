// US-146: mide el error de la sugerencia de stock con los datos sintéticos de US-075.
// Usa exactamente la lógica de la app (Node 24 carga el .ts directamente) y el mismo
// periodo de prueba de US-087 (04/10 – 31/10/2026). No se conecta a ninguna base.
//
//   node scripts/analitica/evaluar-sugerencia-stock.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calcularSugerenciaPlato } from "../../src/features/dashboard/sugerencia-stock-logica.ts";

const CSV = fileURLToPath(new URL("../../data/sintetica/demanda_diaria.csv", import.meta.url));
export const PRUEBA_DESDE = "2026-10-04";
export const PRUEBA_HASTA = "2026-10-31";
export const MAE_PROMEDIO_SIMPLE_US087 = 4.67;

export function leerDemanda(texto) {
  const [cabecera, ...lineas] = texto.replace(/^﻿/, "").trim().split(/\r?\n/);
  const columnas = cabecera.split(",");
  return lineas.map(linea => {
    const valores = linea.split(",");
    const fila = Object.fromEntries(columnas.map((nombre, i) => [nombre, valores[i] ?? ""]));
    return {
      fecha: fila.fecha,
      producto: fila.producto_id,
      vendidas: Number(fila.unidades_vendidas),
      solicitadas: Number(fila.unidades_solicitadas),
      agotado: fila.agotado_desde !== "",
    };
  });
}

// Para cada día de prueba simula la corrida de esa madrugada: solo ve los días anteriores,
// y como en la app solo conoce lo vendido (un día agotado queda marcado AGOTADO).
// Se compara contra lo solicitado, que es la demanda real.
export function evaluar(filas) {
  const porProducto = new Map();
  for (const fila of filas) {
    const lista = porProducto.get(fila.producto) ?? [];
    lista.push(fila);
    porProducto.set(fila.producto, lista);
  }
  const errores = [];
  let sinSugerencia = 0;
  for (const lista of porProducto.values()) {
    const historia = lista.map(fila => ({
      fecha: fila.fecha, unidades: fila.vendidas, motivo: fila.agotado ? "AGOTADO" : null,
    }));
    for (const fila of lista) {
      if (fila.fecha < PRUEBA_DESDE || fila.fecha > PRUEBA_HASTA) continue;
      const sugerencia = calcularSugerenciaPlato(historia, fila.fecha, fila.fecha);
      if (!sugerencia) { sinSugerencia++; continue; }
      errores.push(sugerencia.cantidad - fila.solicitadas);
    }
  }
  const n = errores.length;
  return {
    filas: n,
    sinSugerencia,
    mae: errores.reduce((total, e) => total + Math.abs(e), 0) / n,
    rmse: Math.sqrt(errores.reduce((total, e) => total + e * e, 0) / n),
    sesgo: errores.reduce((total, e) => total + e, 0) / n,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const resultado = evaluar(leerDemanda(await readFile(CSV, "utf8")));
  const fmt = valor => valor.toFixed(2);
  console.log(`Periodo de prueba: ${PRUEBA_DESDE} a ${PRUEBA_HASTA} · ${resultado.filas} días-plato`);
  console.log(`Sugerencia US-146 (promedio ponderado): MAE ${fmt(resultado.mae)} · RMSE ${fmt(resultado.rmse)} · sesgo ${fmt(resultado.sesgo)}`);
  console.log(`Promedio simple US-087 (referencia):   MAE ${fmt(MAE_PROMEDIO_SIMPLE_US087)}`);
  const diferencia = (resultado.mae - MAE_PROMEDIO_SIMPLE_US087) / MAE_PROMEDIO_SIMPLE_US087 * 100;
  console.log(`Diferencia: ${diferencia >= 0 ? "+" : ""}${diferencia.toFixed(1)} % ${diferencia < 0 ? "(mejor)" : "(peor)"}`);
  if (resultado.sinSugerencia) console.log(`Días-plato sin sugerencia propia: ${resultado.sinSugerencia}`);
}
