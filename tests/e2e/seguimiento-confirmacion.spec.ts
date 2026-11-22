import { expect } from "@playwright/test";
import { test, prepararCarrito, pedidosPropios, TOKEN_MOSTRADOR, TOKEN_MESA, RESTAURANTE, type EntornoPedido } from "./ayuda";
import { StockPrueba } from "../soporte/stock-prueba";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

function limpiarPedidosPropios(pedido: EntornoPedido) {
  pedido.alLimpiar(async () => {
      for (const propio of await pedidosPropios(pedido.admin, pedido.marca)) {
        if (propio.status === "CANCELLED") continue;
        const cancelacion = await pedido.admin.rpc("cambiar_estado_pedido", {
          p_pedido_id: propio.id, p_estado: "CANCELLED",
          p_motivo: "US-127: limpieza del pedido propio de seguimiento",
        });
        expect(cancelacion.error).toBeNull();
      }
      expect((await pedidosPropios(pedido.admin, pedido.marca)).every(p => p.status === "CANCELLED")).toBe(true);
  });
}

for (const doble of [false, true]) {
  test(`US-127: ${doble ? "dos toques" : "confirmar"} deja el seguimiento a un toque sin repetir alergias`, async ({ page, pedido }, testInfo) => {
    limpiarPedidosPropios(pedido);
    const carrito = await prepararCarrito(page, TOKEN_MOSTRADOR, pedido);
    const confirmar = carrito.getByRole("button", { name: "Confirmar pedido", exact: true });
    const caja = await confirmar.boundingBox();
    expect(caja).not.toBeNull();
    const x = caja!.x + caja!.width / 2;
    const y = caja!.y + caja!.height / 2;
    await page.touchscreen.tap(x, y);
    if (doble) await page.touchscreen.tap(x, y);

    await expect(carrito.getByText(/^Tu número de pedido es \d+$/)).toBeVisible();
    await expect(carrito.getByRole("group", { name: "¿Alguien tiene alergias?" })).toHaveCount(0);
    await expect(carrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca)).length).toBe(1);
    const [propio] = await pedidosPropios(pedido.admin, pedido.marca);
    const identidad = await pedido.admin.from("orders").select("idempotency_key").eq("id", propio.id).single();
    expect(identidad.error).toBeNull();
    expect(identidad.data).not.toBeNull();
    const enlace = carrito.getByRole("link", { name: "Ver el estado de mi pedido", exact: true });
    const ruta = `/m/${encodeURIComponent(TOKEN_MOSTRADOR)}/pedido/${identidad.data!.idempotency_key}`;
    await expect(enlace).toHaveAttribute("href", ruta);
    await expect(enlace).toBeFocused();
    for (const [width, height] of [[360, 640], [390, 844], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => enlace.evaluate(el => {
        const r = el.getBoundingClientRect();
        const v = window.visualViewport;
        return r.top >= (v?.offsetTop ?? 0) &&
          r.bottom <= (v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight) &&
          r.left >= 0 && r.right <= window.innerWidth &&
          r.height >= 44 && r.width >= 44 &&
          el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`confirmacion-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(carrito.getByText(/Si falta pagar/)).toBeVisible();
    await enlace.tap();
    await expect(page).toHaveURL(url => url.pathname === ruta);
    await expect(page.getByRole("heading", { name: "Estado de mi pedido", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Línea de tiempo", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Avance del pedido" })).toBeVisible();
    await expect(page.getByText("Esperando pago", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Tu pedido", exact: true })
      .getByText("Esperando pago. Paga en caja o con tarjeta para que comencemos a preparar tu pedido.", { exact: true })).toBeVisible();
    await expect(page.getByText("¿Alguien tiene alergias?", { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await pedidosPropios(pedido.admin, pedido.marca)).length).toBe(1);
  });
}

for (const enMesa of [false, true]) {
  test(`US-127: cerrar la confirmación y armar otro pedido ${enMesa ? "en mesa" : "para llevar"} reinicia las alergias`, async ({ page, pedido }) => {
    limpiarPedidosPropios(pedido);
    const primero = await pedido.prepararStock();
    const otro = await pedido.admin.from("products").select("id,name,categories!inner(active)")
      .eq("restaurant_id", RESTAURANTE).eq("active", true).eq("available", true).eq("categories.active", true)
      .neq("id", primero.id).order("price").order("id").limit(1).single();
    expect(otro.error).toBeNull();
    expect(otro.data).not.toBeNull();
    const stockOtro = new StockPrueba(RESTAURANTE);
    pedido.alLimpiar(() => stockOtro.restaurar());
    await stockOtro.preparar(otro.data!.id, 1);
    if (enMesa) await pedido.abrirMesa();
    const carrito = await prepararCarrito(page, enMesa ? TOKEN_MESA : TOKEN_MOSTRADOR, pedido);
    await carrito.getByRole("button", { name: "Sí", exact: true }).click();
    await carrito.getByLabel("Maní", { exact: true }).check();
    await carrito.getByLabel(/^Entiendo que la cocina/).check();
    await carrito.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
    await expect(carrito.getByText(/^Tu número de pedido es \d+$/)).toBeVisible();
    await expect(carrito.getByRole("group", { name: "¿Alguien tiene alergias?" })).toHaveCount(0);
    await carrito.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(carrito).not.toBeVisible();
    const seguimientoPagina = page.getByRole("link", { name: "Ver el estado de mi pedido", exact: true });
    await expect(seguimientoPagina).toBeFocused();
    await expect(seguimientoPagina).toBeVisible();
    // Se arma el segundo pedido en la misma visita, sin recargar ni navegar:
    // una recarga ocultaría un posible fallo al reiniciar el estado de alergias.
    await page.getByRole("button", { name: `Agregar ${otro.data!.name} al carrito`, exact: true }).click();
    await page.getByRole("button", { name: /^Ver carrito:/ }).click();
    const nuevoCarrito = page.getByRole("dialog", { name: "Tu carrito", exact: true });
    await expect(nuevoCarrito.getByRole("heading", { name: otro.data!.name, exact: true })).toBeVisible();
    const alergias = nuevoCarrito.getByRole("group", { name: "¿Alguien tiene alergias?", exact: true });
    await alergias.scrollIntoViewIfNeeded();
    await expect(alergias).toBeVisible();
    await expect(alergias.getByRole("button", { name: "No", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(alergias.getByRole("button", { name: "Sí", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(nuevoCarrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeVisible();
    await expect(nuevoCarrito.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeDisabled();
    await expect(nuevoCarrito.getByText(/^Tu número de pedido es \d+$/)).toHaveCount(0);
    expect(await pedidosPropios(pedido.admin, pedido.marca)).toHaveLength(1);
  });
}
