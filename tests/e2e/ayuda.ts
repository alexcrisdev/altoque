import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const RESTAURANTE = "10000000-0000-0000-0000-000000000001";
export const MESA_NUMERO = Number(process.env.E2E_MESA_NUMERO || 3);
if (!Number.isInteger(MESA_NUMERO) || MESA_NUMERO < 1 || MESA_NUMERO === 2) {
  throw new Error("E2E_MESA_NUMERO debe identificar una mesa demo positiva distinta de Mesa 2.");
}
export const TOKEN_MESA = process.env.E2E_MESA_TOKEN || `demo-mesa-${MESA_NUMERO}`;
export const TOKEN_MOSTRADOR = process.env.E2E_MOSTRADOR_TOKEN || "demo-mostrador";
const correos = {
  mesero: "mesero@demo.altoque.pe",
  cocina: "cocina@demo.altoque.pe",
  caja: "caja@demo.altoque.pe",
  admin: "admin@demo.altoque.pe",
  dueno: "dueno@polleria.demo",
} as const;
export type RolDemo = keyof typeof correos;
const destinos: Record<RolDemo, string> = {
  mesero: "/mesero", cocina: "/cocina", caja: "/caja", admin: "/admin", dueno: "/admin",
};

function variable(nombre: string) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Configura ${nombre} para ejecutar E2E.`);
  return valor;
}

// Autenticación real de usuarios normales desde Node, fuera de la grabación
// del navegador. No se guarda contraseña ni estado de autenticación en archivos.
export async function iniciarSesion(page: Page, rol: RolDemo) {
  const cookies: { name: string; value: string; options: CookieOptions }[] = [];
  const cliente = createServerClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: { getAll: () => [], setAll: (nuevas) => { cookies.push(...nuevas); } },
  });
  const { error } = await cliente.auth.signInWithPassword({ email: correos[rol], password: variable("DEMO_PASSWORD") });
  if (error) throw new Error(`No se pudo iniciar la sesión demo de ${rol}.`);
  const origen = new URL(page.url()).origin;
  await page.context().addCookies(cookies.map(({ name, value }) => ({ name, value, url: origen, sameSite: "Lax" as const })));
  await page.goto(destinos[rol]);
}

// Solo lecturas con RLS y un usuario normal: permite encontrar y limpiar
// nuestro pedido aunque falle la confirmación visible o haya duplicados.
async function clienteAdminDemo() {
  const cliente = createClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email: correos.admin, password: variable("DEMO_PASSWORD") });
  if (error) throw new Error("No se pudo autenticar admin demo para verificar y limpiar E2E.");
  return cliente;
}

export async function pedidosPropios(cliente: SupabaseClient, marca: string) {
  const { data, error } = await cliente.from("orders")
    .select("id, order_number, status, table_session_id, total, order_items!inner(observation, quantity)")
    .eq("restaurant_id", RESTAURANTE).eq("order_items.observation", marca);
  if (error) throw new Error("No se pudieron consultar los pedidos propios de E2E.");
  return data;
}

export async function cancelarPedido(page: Page, id: string, marca: string) {
  await page.goto(`/admin/pedidos/${id}`);
  await expect(page.getByText(marca, { exact: true })).toBeVisible();
  page.once("dialog", (dialogo) => dialogo.accept(`PRUEBA E2E: limpieza ${marca}`));
  await page.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pedido cancelado." })).toBeVisible();
}

export async function abrirSesionMesa(page: Page) {
  const mesa = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Mesa ${MESA_NUMERO}`, exact: true }) });
  await expect(mesa.getByText("Libre", { exact: true }), `Mesa ${MESA_NUMERO} debe estar libre; no se tocan sesiones ajenas`).toBeVisible();
  await mesa.getByRole("button", { name: "Abrir sesión", exact: true }).click();
  // refresh() reemplaza el formulario y su mensaje; comprobar el estado durable.
  await expect(mesa.getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
}

export async function cerrarMesa(page: Page) {
  await page.goto("/mesero");
  const mesa = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Mesa ${MESA_NUMERO}`, exact: true }) });
  page.once("dialog", (dialogo) => dialogo.accept());
  await mesa.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(mesa.getByText("Libre", { exact: true })).toBeVisible();
}

export type EntornoPedido = {
  marca: string;
  admin: SupabaseClient;
  staff: (rol: RolDemo) => Promise<Page>;
  abrirMesa: () => Promise<void>;
  alLimpiar: (tarea: () => Promise<void>) => void;
};

async function paginaStaff(browser: Browser, baseURL: string, rol: RolDemo) {
  const contexto = await browser.newContext({ baseURL });
  const page = await contexto.newPage();
  await page.goto("/login");
  await iniciarSesion(page, rol);
  return { contexto, page };
}

export const test = base.extend<{ pedido: EntornoPedido }>({
  pedido: async ({ browser, baseURL }, ejecutar, testInfo) => {
    const marca = `PRUEBA E2E ${randomUUID()}`;
    const admin = await clienteAdminDemo();
    const contextos: BrowserContext[] = [];
    const paginas = new Map<RolDemo, Page>();
    const tareasLimpieza: (() => Promise<void>)[] = [];
    let sesionPropia: string | undefined;
    let intentoAbrir = false;
    const inicio = new Date().toISOString();
    async function staff(rol: RolDemo) {
      if (!paginas.has(rol)) {
        const nuevo = await paginaStaff(browser, baseURL!, rol);
        contextos.push(nuevo.contexto);
        paginas.set(rol, nuevo.page);
      }
      return paginas.get(rol)!;
    }
    async function sesionMesa() {
      const { data, error } = await admin.from("table_sessions")
        .select("id, opened_at, closed_at, dining_tables!inner(number)")
        .eq("restaurant_id", RESTAURANTE).eq("dining_tables.number", MESA_NUMERO).is("closed_at", null);
      if (error) throw new Error("No se pudo verificar la sesión de la mesa E2E.");
      return data;
    }
    try {
      await ejecutar({ marca, admin, staff, alLimpiar: (tarea) => tareasLimpieza.push(tarea), abrirMesa: async () => {
        expect(await sesionMesa(), `Mesa ${MESA_NUMERO} ocupada: se suspende sin tocar datos ajenos`).toHaveLength(0);
        const mesero = await staff("mesero");
        intentoAbrir = true;
        await abrirSesionMesa(mesero);
        const sesiones = await sesionMesa();
        expect(sesiones).toHaveLength(1);
        sesionPropia = sesiones[0].id;
      } });
    } finally {
      // Se intenta toda la limpieza aunque falle una de sus partes.
      const errores: string[] = [];
      for (const tarea of tareasLimpieza.reverse()) {
        try { await tarea(); }
        catch { errores.push("No se pudo completar la recuperación de la cuenta propia de US-030."); }
      }
      async function conservadoPorCierre(p: Awaited<ReturnType<typeof pedidosPropios>>[number]) {
        const consulta = admin.from("account_closures").select("id").eq("restaurant_id", RESTAURANTE);
        const { data, error } = await (p.table_session_id
          ? consulta.eq("table_session_id", p.table_session_id)
          : consulta.eq("order_id", p.id)).maybeSingle();
        if (error) throw new Error("No se pudo verificar el cierre del pedido propio.");
        // Un pedido cobrado/exceptuado y entregado es historial, no se cancela.
        return Boolean(data) && p.status === "DELIVERED";
      }
      try {
        const pedidos = await pedidosPropios(admin, marca);
        for (const p of pedidos) {
          if (p.status === "CANCELLED" || await conservadoPorCierre(p)) continue;
          try { await cancelarPedido(await staff("admin"), p.id, marca); }
          catch { errores.push(`No se canceló el pedido propio N.º ${p.order_number}.`); }
        }
        const restantes = await pedidosPropios(admin, marca);
        for (const p of restantes) {
          if (p.status !== "CANCELLED" && !await conservadoPorCierre(p)) errores.push(`Quedó sin finalizar el pedido propio N.º ${p.order_number}.`);
        }
      } catch { errores.push("No se pudo comprobar la limpieza de pedidos propios."); }
      if (intentoAbrir) {
        try {
          const sesiones = await sesionMesa();
          // Recuperación si la acción abrió sesión pero falló la respuesta UI.
          const propia = sesiones.find((s) => s.id === sesionPropia || (!sesionPropia && s.opened_at >= inicio));
          if (propia) {
            await cerrarMesa(await staff("mesero"));
            expect(await sesionMesa()).toHaveLength(0);
          }
        } catch { errores.push(`No se pudo cerrar la sesión propia de Mesa ${MESA_NUMERO}; revisar antes de repetir.`); }
      }
      if (errores.length) await testInfo.attach("limpieza-pendiente", { body: `${marca}\n${errores.join("\n")}`, contentType: "text/plain" });
      for (const [rol, page] of paginas) {
        const fallo = testInfo.status !== testInfo.expectedStatus || errores.length > 0;
        const captura = testInfo.outputPath(`${rol}.png`);
        if (fallo) {
          await page.screenshot({ path: captura, fullPage: true });
          await testInfo.attach(`${rol}-captura`, { path: captura, contentType: "image/png" });
        }
      }
      await Promise.all(contextos.map((c) => c.close()));
      await admin.auth.signOut({ scope: "local" });
      expect(errores, "La limpieza forma parte de la aceptación E2E").toEqual([]);
    }
  },
});

export async function prepararCarrito(page: Page, token: string, marca: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${token}`);
  await expect(page.getByRole("heading", {
    name: token === TOKEN_MESA ? `Mesa ${MESA_NUMERO}` : "Pedido para llevar", exact: true,
  }), "El QR demo debe estar activo y corresponder a la ubicación esperada").toBeVisible();
  const productos = page.getByRole("button", { name: /S\// });
  // Precio visible, sin depender del nombre ni de clases CSS.
  await expect(productos.first()).toBeVisible();
  const candidatos = await productos.allTextContents();
  const disponibles = candidatos.map((texto, indice) => ({
    indice, texto, precio: Number(texto.match(/S\/\s*([\d,.]+)/)?.[1].replaceAll(",", "")),
  })).filter((p) => !p.texto.includes("Agotado") && Number.isFinite(p.precio));
  disponibles.sort((a, b) => a.precio - b.precio);
  expect(disponibles.length, "Debe existir un producto disponible con precio visible").toBeGreaterThan(0);
  await productos.nth(disponibles[0].indice).click();
  const detalle = page.getByRole("dialog");
  await detalle.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
  await detalle.getByRole("button", { name: "Cerrar detalle", exact: true }).click();
  await page.getByRole("button", { name: /^Ver carrito:/ }).click();
  const carrito = page.getByRole("dialog", { name: "Tu carrito" });
  await carrito.getByLabel(/^Observaciones para/).fill(marca);
  const nombre = carrito.getByLabel(/^Nombre/);
  if (await nombre.count()) {
    await nombre.fill("PRUEBA E2E");
    await carrito.getByLabel(/^Teléfono/).fill("999999999");
  }
  await expect(carrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeEnabled();
  return carrito;
}

export async function confirmarYVerificar(page: Page, pedido: EntornoPedido, doble = false) {
  const boton = page.getByRole("button", { name: "Confirmar pedido", exact: true });
  if (doble) {
    // Dos eventos en el mismo turno: ejercita el bloqueo inmediato de US-007.
    await boton.evaluate((elemento: HTMLButtonElement) => { elemento.click(); elemento.click(); });
  } else await boton.click();
  const mensaje = page.getByText(/^Tu número de pedido es \d+$/).first();
  await expect(mensaje).toBeVisible();
  const numero = Number((await mensaje.innerText()).match(/\d+/)![0]);
  await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca)).length).toBe(1);
  const registros = await pedidosPropios(pedido.admin, pedido.marca);
  expect(Number(registros[0].order_number)).toBe(numero);
  expect(registros[0].status).toBe("IN_PROGRESS");
  const inicial = await pedido.admin.from("order_status_history").select("to_status")
    .eq("restaurant_id", RESTAURANTE).eq("order_id", registros[0].id).is("from_status", null).single();
  expect(inicial.error).toBeNull();
  expect(inicial.data?.to_status).toBe("IN_PROGRESS");
  expect(registros[0].order_items).toHaveLength(1);
  expect(registros[0].order_items[0].quantity).toBe(1);
  const cocina = await pedido.staff("cocina");
  await expect(cocina.getByRole("heading", { name: `N.º ${numero}`, exact: true })).toBeVisible();
  await expect(cocina.getByText(`Observación: ${pedido.marca}`, { exact: true })).toBeVisible();
  await expect(cocina.getByRole("button", { name: `Marcar listo el pedido N.º ${numero}`, exact: true })).toBeVisible();
  const mesero = await pedido.staff("mesero");
  await mesero.goto("/mesero");
  await expect(mesero.getByRole("link", { name: `Ver pedido N.º ${numero}`, exact: true }).first()).toBeVisible();
  // Verifica de nuevo después de los recorridos: detecta un segundo registro tardío.
  expect(await pedidosPropios(pedido.admin, pedido.marca)).toHaveLength(1);
}
