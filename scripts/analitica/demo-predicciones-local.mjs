// US-090: fixtures manuales para capturas. Nunca se conecta a la base compartida.
// No carga el CSV del modelo ni sustituye al cargador reservado al revisor.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const restaurante = "10000000-0000-0000-0000-000000000001";
const accion = process.argv[2];

async function ejecutar() {
  if (!["preparar", "limpiar"].includes(accion)) {
    throw new Error("Uso: node scripts/analitica/demo-predicciones-local.mjs preparar|limpiar");
  }
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
    throw new Error("Detenido: este script solo admite Supabase LOCAL en el puerto 54321.");
  }
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY de Supabase local.");
  const cliente = createClient(url.origin, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const identificador = createHash("sha256").update(`${url.origin}|${process.cwd()}`).digest("hex").slice(0, 16);
  // El registro de limpieza vive en la carpeta del usuario, fuera del temp compartido.
  const directorio = join(homedir(), ".altoque", "us090");
  const archivo = join(directorio, `fixtures-${identificador}.json`);

  async function limpiar(datos) {
    if (datos.destino !== url.origin || datos.restaurante !== restaurante
      || !Array.isArray(datos.predicciones) || !Array.isArray(datos.stock)) {
      throw new Error("El registro de limpieza no corresponde a este entorno local.");
    }
    // Los UUID se generan antes de insertar: incluso una carga parcial se puede limpiar.
    for (const [tabla, ids] of [["demand_forecasts", datos.predicciones], ["product_daily_stock", datos.stock]]) {
      if (!ids.length) continue;
      const { error } = await cliente.from(tabla).delete().eq("restaurant_id", restaurante).in("id", ids);
      if (error) throw new Error(`No se pudo limpiar ${tabla}: ${error.code}. Conserva el registro temporal y vuelve a ejecutar limpiar.`);
    }
    await unlink(archivo);
    console.log("Fixtures eliminados. No se modificaron las filas que existían antes de esta preparación.");
  }

  if (accion === "limpiar") {
    let datos;
    try { datos = JSON.parse(await readFile(archivo, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") { console.log("No hay fixtures pendientes de esta carpeta."); return; }
      throw error;
    }
    await limpiar(datos);
    return;
  }

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const parte = tipo => partes.find(actual => actual.type === tipo).value;
  const manana = new Date(`${parte("year")}-${parte("month")}-${parte("day")}T00:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const fecha = manana.toISOString().slice(0, 10);

  const existentes = await cliente.from("demand_forecasts").select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurante).eq("forecast_date", fecha);
  if (existentes.error) throw new Error(`No se pudo consultar demand_forecasts: ${existentes.error.code}.`);
  if (existentes.count !== 0) throw new Error("Ya existen predicciones para mañana en este restaurante local. No se reemplazaron.");

  const productos = await cliente.from("products").select("id, name").eq("restaurant_id", restaurante)
    .eq("active", true).order("name").limit(3);
  if (productos.error || productos.data?.length !== 3) throw new Error("Se necesitan tres productos demo activos.");
  const ids = productos.data.map(actual => actual.id);
  const stockPrevio = await cliente.from("product_daily_stock").select("id").eq("restaurant_id", restaurante)
    .eq("stock_date", fecha).in("product_id", ids);
  if (stockPrevio.error || stockPrevio.data?.length !== 0) {
    throw new Error("No se pudo comprobar que los tres productos estén sin stock registrado para mañana. No se modificó nada.");
  }

  const datos = {
    destino: url.origin, restaurante, fecha,
    predicciones: ids.map(() => randomUUID()), stock: [randomUUID(), randomUUID()],
  };
  // Directorio privado y archivo exclusivo: no sobrescribir una limpieza pendiente.
  await mkdir(directorio, { recursive: true, mode: 0o700 });
  await writeFile(archivo, JSON.stringify(datos), { flag: "wx", mode: 0o600 });
  try {
    const modelo = `us090-captura-${randomUUID()}-demo`;
    const cantidades = [46, 36, 28];
    const carga = await cliente.from("demand_forecasts").insert(productos.data.map((producto, i) => ({
      id: datos.predicciones[i], restaurant_id: restaurante, product_id: producto.id,
      forecast_date: fecha, predicted_quantity: cantidades[i], model: modelo,
    })));
    if (carga.error) throw new Error(`No se crearon las predicciones de prueba: ${carga.error.code}.`);
    const stock = await cliente.from("product_daily_stock").insert([0, 1].map(i => ({
      id: datos.stock[i], restaurant_id: restaurante, product_id: ids[i],
      stock_date: fecha, quantity: [30, 50][i], sold: 0,
    })));
    if (stock.error) throw new Error(`No se creó el stock de prueba: ${stock.error.code}.`);
    console.log(`Destino LOCAL: ${url.origin}. Fecha prevista: ${fecha}.`);
    console.log(`${productos.data[0].name}: previsto 46, stock 30, faltarían 16.`);
    console.log(`${productos.data[1].name}: previsto 36, stock 50, suficiente.`);
    console.log(`${productos.data[2].name}: previsto 28, sin stock registrado, sin alerta.`);
    console.log("Son fixtures manuales para capturas, no resultados del modelo US-087.");
    console.log("Al terminar: node scripts/analitica/demo-predicciones-local.mjs limpiar");
  } catch (error) {
    try { await limpiar(datos); }
    catch (falloLimpieza) { console.error(falloLimpieza.message); }
    throw error;
  }
}

ejecutar().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
