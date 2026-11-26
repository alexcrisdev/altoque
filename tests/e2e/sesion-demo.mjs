import { createServerClient } from "@supabase/ssr";

export const correosDemo = {
  mesero: "mesero@demo.altoque.pe",
  cocina: "cocina@demo.altoque.pe",
  caja: "caja@demo.altoque.pe",
  admin: "admin@demo.altoque.pe",
  dueno: "dueno@polleria.demo",
};

export const destinosDemo = {
  mesero: "/mesero", cocina: "/cocina", caja: "/caja", admin: "/admin", dueno: "/admin",
};

function variable(nombre) {
  const valor = process.env[nombre];
  if (!valor?.trim()) throw new Error(`Configura ${nombre} en .env.local para iniciar las sesiones demo.`);
  return valor;
}

// Autenticación de las E2E y de demo:abrir. Cookies solo en memoria;
// sin service role, archivos de sesión ni operaciones sobre datos del restaurante.
/**
 * @param {import('@playwright/test').Page} page
 * @param {keyof typeof correosDemo} rol
 */
export async function iniciarSesion(page, rol) {
  /** @type {{ name: string, value: string, options: import('@supabase/ssr').CookieOptions }[]} */
  const cookies = [];
  const cliente = createServerClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => [], setAll: (nuevas) => { cookies.push(...nuevas); } },
  });
  const password = variable("DEMO_PASSWORD");
  try {
    const { error } = await cliente.auth.signInWithPassword({ email: correosDemo[rol], password });
    if (error) throw error;
  } catch {
    throw new Error(`No se pudo iniciar la sesión demo de ${rol}. Revisa DEMO_PASSWORD, el usuario demo y la conexión con Supabase.`);
  }
  const origen = new URL(page.url()).origin;
  await page.context().addCookies(cookies.map(({ name, value }) => ({ name, value, url: origen, sameSite: "Lax" })));
  await page.goto(destinosDemo[rol]);
}

// US-106 (Fase C): cierra la sesión demo de un contexto del navegador. Usa las mismas
// cookies que dejó iniciarSesion y revoca SOLO esa sesión (scope "local"): no cierra
// otras sesiones de la misma cuenta. Sin cookies de Supabase no hace nada.
/**
 * @param {import('@playwright/test').BrowserContext} contexto
 */
export async function cerrarSesionDemo(contexto) {
  const cookies = (await contexto.cookies()).filter(({ name }) => name.startsWith("sb-"));
  if (!cookies.length) return;
  const cliente = createServerClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => cookies.map(({ name, value }) => ({ name, value })), setAll: () => {} },
  });
  const { error } = await cliente.auth.signOut({ scope: "local" });
  if (error) throw new Error("No se pudo cerrar la sesión demo de la prueba.");
  await contexto.clearCookies();
}
