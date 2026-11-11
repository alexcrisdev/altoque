import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { destinosDemo, iniciarSesion } from "../tests/e2e/sesion-demo.mjs";

/** @param {Record<string, string | undefined>} entorno */
export function configuracionDemo(entorno = process.env) {
  for (const nombre of ["DEMO_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (!entorno[nombre]?.trim()) throw new Error(`Falta ${nombre}. Configúrala en .env.local antes de ejecutar npm run demo:abrir.`);
  }
  let url;
  try {
    url = new URL(entorno.E2E_BASE_URL?.trim() || "http://localhost:3000");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  } catch {
    throw new Error("E2E_BASE_URL debe ser el origen HTTP/HTTPS del entorno de pruebas, sin credenciales ni ruta.");
  }
  const token = entorno.E2E_MESA_TOKEN?.trim() || entorno.E2E_MOSTRADOR_TOKEN?.trim() || "demo-mesa-1";
  if (/token_de|token_del|aqui|aquí|[/?#\s]/i.test(token)) {
    throw new Error("El QR de prueba contiene un ejemplo o un enlace. Configura solo su token vigente en E2E_MESA_TOKEN o E2E_MOSTRADOR_TOKEN.");
  }
  return { baseURL: url.origin, token };
}

/**
 * @param {{config?: ReturnType<typeof configuracionDemo>, lanzar?: typeof chromium.launch, autenticar?: typeof iniciarSesion, informar?: (mensaje: string) => void}} opciones
 */
export async function abrirDemo({ config = configuracionDemo(), lanzar = chromium.launch.bind(chromium), autenticar = iniciarSesion, informar = console.log } = {}) {
  /** @type {import('@playwright/test').Browser[]} */
  const navegadores = [];
  const pantallas = [
    { rol: "mesero", titulo: "Panel mesero" },
    { rol: "cocina", titulo: "Cocina" },
    { rol: "caja", titulo: "Caja" },
    { rol: "admin", titulo: "Panel administrador" },
    { rol: "cliente", titulo: "" },
  ];
  try {
    for (const pantalla of pantallas) {
      let navegador;
      try { navegador = await lanzar({ headless: false }); }
      catch { throw new Error("No se pudo abrir Chromium. Ejecuta npx playwright install chromium y comprueba que puedes abrir ventanas en esta computadora."); }
      navegadores.push(navegador);
      const contexto = await navegador.newContext({ baseURL: config.baseURL, viewport: { width: 1100, height: 800 } });
      const page = await contexto.newPage();
      page.setDefaultTimeout(20_000);
      page.setDefaultNavigationTimeout(30_000);
      if (pantalla.rol === "cliente") {
        try {
          const response = await page.goto(`/m/${encodeURIComponent(config.token)}`);
          if (!response?.ok()) throw new Error();
          await page.getByRole("heading", { name: /^(Mesa \d+|Pedido para llevar)$/ }).waitFor();
        } catch {
          throw new Error("No se pudo abrir la carta del cliente. Revisa que la app esté disponible y que el QR de prueba siga activo.");
        }
      } else {
        try { await page.goto("/login"); }
        catch { throw new Error("No se pudo acceder a AlToque. Inicia npm run dev en otra terminal o revisa E2E_BASE_URL."); }
        /** @type {keyof typeof destinosDemo} */
        const rol = /** @type {keyof typeof destinosDemo} */ (pantalla.rol);
        await autenticar(page, rol);
        try {
          if (new URL(page.url()).pathname !== destinosDemo[rol]) throw new Error();
          await page.getByRole("heading", { name: pantalla.titulo, exact: true }).waitFor();
        } catch {
          throw new Error(`La sesión de ${rol} no pudo acceder a su panel. Revisa su rol, el entorno y la disponibilidad de la app.`);
        }
      }
      informar(`Ventana lista: ${pantalla.rol}.`);
    }
    return navegadores;
  } catch (error) {
    await Promise.allSettled(navegadores.map(browser => browser.close()));
    throw error;
  }
}

async function main() {
  try {
    const archivoEnv = fileURLToPath(new URL("../.env.local", import.meta.url));
    if (!existsSync(archivoEnv)) throw new Error("Falta .env.local. Cópialo desde .env.example y configura las credenciales demo y el QR vigente.");
    process.loadEnvFile(archivoEnv);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const config = configuracionDemo();
    console.log("Abriendo el entorno de pruebas con sesiones independientes. No se modifican pedidos, mesas, usuarios ni pagos.");
    const navegadores = await abrirDemo({ config });
    const cerrar = () => { void Promise.allSettled(navegadores.map(browser => browser.close())); };
    process.once("SIGINT", cerrar);
    process.once("SIGTERM", cerrar);
    console.log("Cinco ventanas listas. Mantén esta terminal abierta; Ctrl+C cierra las ventanas del comando.");
    await Promise.all(navegadores.map(browser => browser.isConnected()
      ? new Promise(resolve => browser.once("disconnected", resolve)) : Promise.resolve()));
    process.removeListener("SIGINT", cerrar);
    process.removeListener("SIGTERM", cerrar);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo abrir el entorno demo.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
