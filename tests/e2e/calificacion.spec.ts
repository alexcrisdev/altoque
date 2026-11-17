import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { iniciarSesion } from "./sesion-demo.mjs";
import { claveCierreCalificacion } from "../../src/features/pedidos/calificacion-cliente";

test("US-093: Mesa 2, cerrar sin guardar y calificar una sola vez (solo local)", async ({ page, browser }) => {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://no-local.invalid");
  test.skip(url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname), "Solo fixtures en Supabase local; nunca Mesa 2 compartida");
  const restaurante = "10000000-0000-0000-0000-000000000001";
  async function login(correo: string) {
    const db = createClient(url.href, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await db.auth.signInWithPassword({ email: correo, password: process.env.DEMO_PASSWORD! });
    expect(r.error).toBeNull();
    return { db, usuario: r.data.user!.id };
  }
  const admin = await login("admin@demo.altoque.pe");
  const mesero = await login("mesero@demo.altoque.pe");
  const mesa = await admin.db.from("dining_tables").select("id,branch_id").eq("restaurant_id", restaurante).eq("number", 2).single();
  expect(mesa.error).toBeNull();
  const previas = await admin.db.from("table_sessions").select("id").eq("dining_table_id", mesa.data!.id).is("closed_at", null);
  expect(previas.data).toHaveLength(0);
  const producto = await admin.db.from("products").select("id,name,price").eq("restaurant_id", restaurante).eq("active", true).eq("available", true).order("price").limit(1).single();
  expect(producto.error).toBeNull();
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const stock = await admin.db.from("product_daily_stock").select("quantity,sold").eq("restaurant_id", restaurante).eq("product_id", producto.data!.id).eq("stock_date", fecha).maybeSingle();
  expect(stock.error).toBeNull();
  const preparar = await admin.db.rpc("guardar_stock_diario", { p_restaurant_id: restaurante, p_stock_date: fecha, p_parcial: true,
    p_items: [{ productoId: producto.data!.id, cantidad: stock.data ? Math.max(stock.data.quantity, stock.data.sold + 1) : null }] });
  expect(preparar.error).toBeNull();
  const abierta = await mesero.db.from("table_sessions").insert({ restaurant_id: restaurante, branch_id: mesa.data!.branch_id, dining_table_id: mesa.data!.id, opened_by: mesero.usuario }).select("id").single();
  expect(abierta.error).toBeNull();
  let pedidoId: string | undefined;
  const cajaContexto = await browser.newContext();
  const marca = `US-093 LOCAL ${randomUUID()}`;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/m/demo-mesa-2");
    await expect(page.getByRole("heading", { name: "Mesa 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Agregar ${producto.data!.name} al carrito`, exact: true }).click();
    await page.getByRole("button", { name: /^Ver carrito:/ }).click();
    const carrito = page.getByRole("dialog", { name: "Tu carrito" });
    await carrito.getByLabel(/^Observaciones para/).fill(marca);
    await carrito.getByRole("button", { name: "No", exact: true }).click();
    await carrito.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
    await expect(page.getByText(/^Tu número de pedido es \d+$/).first()).toBeVisible();
    const pedido = await admin.db.from("orders").select("id,idempotency_key,order_items!inner(observation)")
      .eq("restaurant_id", restaurante).eq("table_session_id", abierta.data!.id).eq("order_items.observation", marca).single();
    expect(pedido.error).toBeNull();
    pedidoId = pedido.data!.id;
    const clave = pedido.data!.idempotency_key;
    await page.goto(`/m/demo-mesa-2/pedido/${clave}`);
    await expect(page.getByRole("heading", { name: "Línea de tiempo", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Calificación opcional" })).toHaveCount(0);
    const caja = await cajaContexto.newPage();
    await caja.goto(new URL("/login", page.url()).href);
    await iniciarSesion(caja, "caja");
    await caja.goto(new URL(`/caja/mesa/${abierta.data!.id}`, page.url()).href);
    await caja.getByText("Efectivo", { exact: true }).click();
    await caja.getByLabel(/^Monto a cobrar \(S\/\)/).fill(String(producto.data!.price));
    await caja.getByLabel("Efectivo recibido (S/)", { exact: true }).fill(String(producto.data!.price));
    await caja.getByRole("button", { name: "Registrar pago", exact: true }).click();
    await expect.poll(async () => (await admin.db.from("orders").select("status").eq("id", pedidoId!).single()).data?.status).toBe("IN_PROGRESS");
    await page.reload();
    const opinion = page.getByRole("region", { name: "Calificación opcional" });
    await expect(opinion).toBeVisible();
    let solicitudes = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.headers()["next-action"]) solicitudes++; });
    await opinion.getByRole("button", { name: "Cerrar calificación sin enviar" }).click();
    await page.reload();
    await expect(opinion).toHaveCount(0);
    expect(solicitudes).toBe(0);
    const vacia = await admin.db.from("order_ratings").select("id").eq("order_id", pedidoId!);
    expect(vacia.error).toBeNull();
    expect(vacia.data).toHaveLength(0);
    // Solo para cubrir ambas decisiones con el mismo fixture: retirar la
    // preferencia de cierre en este navegador, sin modificar ningún pedido.
    await page.evaluate((key) => localStorage.removeItem(key), claveCierreCalificacion(clave));
    await page.reload();
    const servicio = opinion.getByRole("radio", { name: "5 estrellas para servicio", exact: true });
    await servicio.press("Space");
    await expect(servicio).toBeChecked();
    const meseroEstrellas = opinion.getByRole("radio", { name: "4 estrellas para mesero", exact: true });
    await meseroEstrellas.locator("..").click();
    await expect(meseroEstrellas).toBeChecked();
    await opinion.getByLabel("Comentario (opcional)").fill("Buena atención. Prueba local US-093.");
    await opinion.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "docs/pruebas/evidencias/us093-calificacion.png", fullPage: true });
    await opinion.getByRole("button", { name: "Enviar opinión", exact: true }).click();
    await expect(opinion).toHaveCount(0);
    await page.reload();
    await expect(opinion).toHaveCount(0);
    const guardada = await admin.db.from("order_ratings").select("service_stars,waiter_stars,comment").eq("order_id", pedidoId!);
    expect(guardada.error).toBeNull();
    expect(guardada.data).toEqual([{ service_stars: 5, waiter_stars: 4, comment: "Buena atención. Prueba local US-093." }]);
  } finally {
    await cajaContexto.close();
    // El guard local inicial impide ejecutar esta limpieza en la base compartida.
    const id = pedidoId ?? "00000000-0000-0000-0000-000000000000";
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9-]{36}$/.test(abierta.data!.id)) throw new Error("Fixture inválido");
    const restaurarStock = stock.data
      ? `update public.product_daily_stock set quantity=${Number(stock.data.quantity)}, sold=${Number(stock.data.sold)} where product_id='${producto.data!.id}' and stock_date='${fecha}';`
      : `delete from public.product_daily_stock where product_id='${producto.data!.id}' and stock_date='${fecha}';`;
    execFileSync("docker", ["exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
      input: `begin; delete from public.order_ratings where order_id='${id}'; delete from public.payments where table_session_id='${abierta.data!.id}';
delete from public.order_status_history where order_id='${id}'; delete from public.orders where id='${id}';
delete from public.table_sessions where id='${abierta.data!.id}'; ${restaurarStock} commit;`, stdio: ["pipe", "pipe", "pipe"],
    });
    await Promise.all([admin.db.auth.signOut(), mesero.db.auth.signOut()]);
  }
});
