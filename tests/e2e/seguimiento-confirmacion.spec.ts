import { expect } from "@playwright/test";
import { test, prepararCarrito, pedidosPropios, TOKEN_MOSTRADOR } from "./ayuda";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const doble of [false, true]) {
  test(`US-127: ${doble ? "dos toques" : "confirmar"} deja el seguimiento a un toque sin repetir alergias`, async ({ page, pedido }, testInfo) => {
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
