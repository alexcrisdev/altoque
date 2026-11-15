import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const CSV = fileURLToPath(new URL("../../analitica/prediccion_7_dias.csv", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAVE_UNICA = "restaurant_id,product_id,forecast_date,model";
const COLUMNAS = ["fecha", "producto_id", "producto", "cantidad_prevista", "modelo"];

export function leerArgumentos(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: {
      restaurante: { type: "string" },
      "desplazar-dias": { type: "string", default: "0" },
      aplicar: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return { ayuda: true };
  if (!values.restaurante || !UUID.test(values.restaurante)) {
    throw new Error("Indica --restaurante con un UUID válido.");
  }
  const textoDias = values["desplazar-dias"];
  if (!/^-?\d+$/.test(textoDias) || !Number.isSafeInteger(Number(textoDias))) {
    throw new Error("--desplazar-dias debe ser un entero seguro.");
  }
  return {
    ayuda: false, restauranteId: values.restaurante,
    desplazarDias: Number(textoDias), aplicar: values.aplicar,
  };
}

// Admite BOM, CRLF, comas y comillas escapadas dentro de un campo.
function leerFilasCsv(texto) {
  if (!texto.trim() || texto.length > 5_000_000) throw new Error("El CSV está vacío o es demasiado grande.");
  const filas = [];
  let fila = [], campo = "", citado = false, cerrado = false;
  function guardarCampo() { fila.push(campo); campo = ""; cerrado = false; }
  function guardarFila() {
    guardarCampo();
    if (fila.some(valor => valor !== "")) filas.push(fila);
    fila = [];
    if (filas.length > 50_001) throw new Error("El CSV supera las 50 000 filas.");
  }
  const contenido = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < contenido.length; i++) {
    const caracter = contenido[i];
    if (citado) {
      if (caracter === '"') {
        if (contenido[i + 1] === '"') { campo += '"'; i++; }
        else { citado = false; cerrado = true; }
      } else campo += caracter;
    } else if (caracter === ",") guardarCampo();
    else if (caracter === "\n" || caracter === "\r") {
      guardarFila();
      if (caracter === "\r" && contenido[i + 1] === "\n") i++;
    } else if (caracter === '"' && campo === "" && !cerrado) citado = true;
    else {
      if (cerrado || caracter === '"') throw new Error("El CSV tiene comillas inválidas.");
      campo += caracter;
    }
  }
  if (citado) throw new Error("El CSV tiene comillas sin cerrar.");
  if (campo !== "" || fila.length || cerrado) guardarFila();
  const cabecera = filas.shift();
  if (!cabecera || new Set(cabecera).size !== cabecera.length || cabecera.some(valor => !valor.trim()) ||
      COLUMNAS.some(columna => !cabecera.includes(columna))) {
    throw new Error(`El CSV debe contener columnas únicas: ${COLUMNAS.join(", ")}.`);
  }
  if (!filas.length) throw new Error("El CSV no contiene predicciones.");
  return filas.map((valores, indice) => {
    if (valores.length !== cabecera.length) throw new Error(`Columnas incompletas en la fila ${indice + 2}.`);
    return Object.fromEntries(cabecera.map((nombre, i) => [nombre, valores[i]]));
  });
}

function desplazarFecha(fecha, dias) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith("0000-")) throw new Error(`Fecha inválida: ${fecha}.`);
  const valor = new Date(`${fecha}T00:00:00.000Z`);
  if (!Number.isFinite(valor.getTime()) || valor.toISOString().slice(0, 10) !== fecha) {
    throw new Error(`Fecha inválida: ${fecha}.`);
  }
  valor.setUTCDate(valor.getUTCDate() + dias);
  if (!Number.isFinite(valor.getTime()) || valor.getUTCFullYear() < 1 || valor.getUTCFullYear() > 9999) {
    throw new Error("El desplazamiento produce una fecha fuera de rango.");
  }
  return valor.toISOString().slice(0, 10);
}

const normalizarNombre = nombre => nombre.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

export function leerPredicciones(texto, desplazarDias = 0) {
  if (!Number.isSafeInteger(desplazarDias)) throw new Error("El desplazamiento debe ser entero.");
  const claves = new Set();
  return leerFilasCsv(texto).map((fila, indice) => {
    const fecha = desplazarFecha(fila.fecha.trim(), desplazarDias);
    const nombre = fila.producto.trim();
    const idModelo = fila.producto_id.trim();
    let modelo = fila.modelo.trim();
    if (!nombre || !idModelo || !modelo) throw new Error(`Faltan datos en la fila ${indice + 2}.`);
    if (desplazarDias !== 0 && !modelo.endsWith("-demo")) modelo += "-demo";
    if (modelo.length > 120) throw new Error("El nombre del modelo supera los 120 caracteres.");
    const textoCantidad = fila.cantidad_prevista.trim();
    const cantidad = Number(textoCantidad);
    if (!/^\d+(?:\.\d+)?$/.test(textoCantidad) || !Number.isFinite(cantidad) || cantidad > 2147483647) {
      throw new Error(`Cantidad inválida en la fila ${indice + 2}.`);
    }
    // Unidades enteras: redondeo al entero más cercano; .5 sube.
    const cantidadPrevista = Math.round(cantidad);
    const clave = JSON.stringify([fecha, normalizarNombre(nombre), modelo]);
    if (claves.has(clave)) throw new Error(`Predicción duplicada: ${fecha}, ${nombre}, ${modelo}.`);
    claves.add(clave);
    return { fecha, idModelo, nombre, cantidadPrevista, modelo };
  });
}

export function prepararCarga(filas, productos, restauranteId) {
  if (!UUID.test(restauranteId)) throw new Error("El restaurante no tiene un UUID válido.");
  const porNombre = new Map();
  for (const producto of productos) {
    if (!UUID.test(producto.id) || typeof producto.name !== "string" || !producto.name.trim()) {
      throw new Error("El catálogo devolvió un producto incompleto.");
    }
    const nombre = normalizarNombre(producto.name);
    const coincidencias = porNombre.get(nombre) ?? [];
    coincidencias.push(producto);
    porNombre.set(nombre, coincidencias);
  }
  const cargas = [], incidencias = [];
  for (const fila of filas) {
    const coincidencias = porNombre.get(normalizarNombre(fila.nombre)) ?? [];
    if (coincidencias.length !== 1) {
      incidencias.push({ fecha: fila.fecha, producto: fila.nombre,
        motivo: coincidencias.length ? "nombre ambiguo" : "sin coincidencia" });
      continue;
    }
    cargas.push({
      restaurant_id: restauranteId, product_id: coincidencias[0].id,
      forecast_date: fila.fecha, predicted_quantity: fila.cantidadPrevista, model: fila.modelo,
    });
  }
  return { cargas, incidencias };
}

async function listarProductos(cliente, restauranteId) {
  const productos = [], ids = new Set();
  let inicio = 0, totalEsperado = null;
  while (true) {
    const { data, error, count } = await cliente.from("products")
      .select("id, name", { count: "exact" }).eq("restaurant_id", restauranteId)
      .order("id", { ascending: true }).range(inicio, inicio + 499);
    if (error || data === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("No se pudo leer el catálogo completo del restaurante.");
    }
    if (totalEsperado !== null && count !== totalEsperado) throw new Error("El catálogo cambió; repite el simulacro.");
    totalEsperado = count;
    for (const producto of data) {
      if (ids.has(producto.id)) throw new Error("El catálogo devolvió productos duplicados; repite el simulacro.");
      ids.add(producto.id);
      productos.push(producto);
    }
    inicio += data.length;
    if (inicio === count) return productos;
    if (!data.length || inicio > count) throw new Error("El catálogo está incompleto.");
  }
}

export async function cargarPredicciones(cliente, filas, restauranteId, aplicar = false, informar = console.log) {
  const productos = await listarProductos(cliente, restauranteId);
  const plan = prepararCarga(filas, productos, restauranteId);
  informar(`Modo: ${aplicar ? "APLICAR" : "SIMULACRO (sin escrituras)"}`);
  informar(`Restaurante: ${restauranteId}`);
  informar(`CSV: ${filas.length} filas. Coinciden: ${plan.cargas.length}. Omitidas: ${plan.incidencias.length}.`);
  for (const incidencia of plan.incidencias) informar(`${incidencia.fecha} | ${incidencia.producto}: ${incidencia.motivo}`);
  const nombres = new Map(productos.map(producto => [producto.id, producto.name]));
  for (const fila of plan.cargas) {
    informar(`${fila.forecast_date} | ${nombres.get(fila.product_id)} (${fila.product_id}) | ~${fila.predicted_quantity} | ${fila.model}`);
  }
  if (aplicar && plan.cargas.length) {
    const { error } = await cliente.from("demand_forecasts").upsert(plan.cargas, {
      onConflict: CLAVE_UNICA, defaultToNull: false,
    });
    if (error) throw new Error("No se pudieron guardar las predicciones. Comprueba la migración y vuelve a intentarlo.");
    informar(`Upsert completado: ${plan.cargas.length} filas; la clave única evita duplicados al repetir.`);
  } else if (!aplicar) informar("No se escribió ninguna predicción. --aplicar queda reservado al revisor.");
  else informar("No hay filas coincidentes para cargar.");
  return plan;
}

async function main() {
  const opciones = leerArgumentos();
  if (opciones.ayuda) {
    console.log("Uso: node --env-file=.env.local scripts/analitica/cargar-predicciones.mjs --restaurante <UUID> [--desplazar-dias N] [--aplicar]");
    console.log("Por defecto: simulacro. Sin --aplicar no se escribe en la base.");
    return;
  }
  const filas = leerPredicciones(await readFile(CSV, "utf8"), opciones.desplazarDias);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  const destino = new URL(url);
  if (!["https:", "http:"].includes(destino.protocol) || destino.username || destino.password) {
    throw new Error("La URL de Supabase no es válida.");
  }
  console.log(`Destino: ${destino.origin}`);
  const cliente = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  await cargarPredicciones(cliente, filas, opciones.restauranteId, opciones.aplicar);
}

// Importarlo desde Vitest no ejecuta el CLI ni se conecta a Supabase.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "No se pudo preparar la carga.");
    process.exitCode = 1;
  });
}
