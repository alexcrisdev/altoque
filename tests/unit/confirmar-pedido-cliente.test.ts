import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelCarrito } from "../../src/features/pedidos/panel-carrito";
import type { ResultadoRegistroPedido } from "../../src/features/pedidos/actions";

const controles = vi.hoisted(() => ({
  setItems: vi.fn(),
  panel: null as ComponentProps<typeof PanelCarrito> | null,
  items: [{ productoId: "limonada", cantidad: 2, observacion: null }],
}));

// Ejecutar los callbacks reales de la carta con un carrito inicial, sin servidor ni DOM.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (inicial: unknown) => Array.isArray(inicial)
      ? [controles.items, controles.setItems]
      : react.useState(inicial),
  };
});
vi.mock("../../src/features/pedidos/actions", () => ({ registrarPedidoQrAction: vi.fn() }));
vi.mock("../../src/features/pedidos/panel-carrito", () => ({
  PanelCarrito: (props: ComponentProps<typeof PanelCarrito>) => {
    controles.panel = props;
    return null;
  },
}));
vi.mock("../../src/features/carta/detalle-producto", () => ({ DetalleProducto: () => null }));

import { registrarPedidoQrAction } from "../../src/features/pedidos/actions";
import { CartaInteractiva } from "../../src/features/carta/carta-interactiva";

function preparar(habilitados = true) {
  renderToStaticMarkup(createElement(CartaInteractiva, {
    token: "token-qr", pedidosHabilitados: habilitados,
    pedido: { modalidadQr: "DINE_IN", mesaNumero: 1, paraLlevar: { pideNombre: true, pideTelefono: false } },
    categorias: [{ id: "bebidas", name: "Bebidas", productos: [{
      id: "limonada", category_id: "bebidas", name: "Limonada", price: 8.5,
      available: true, description: null, image_url: null, ingredients: null, allergens: [],
    }] }],
  }));
  return controles.panel!;
}

beforeEach(() => {
  vi.resetAllMocks();
  controles.panel = null;
});

describe("envío del carrito desde la carta", () => {
  it("envía el contrato con el token y vacía el carrito solo después del éxito", async () => {
    vi.mocked(registrarPedidoQrAction).mockResolvedValue({ ok: true, numero: 42 });
    await preparar().onConfirmar();
    expect(registrarPedidoQrAction).toHaveBeenCalledWith("token-qr", expect.any(String), [
      { productoId: "limonada", cantidad: 2, observacion: null, precioMostradoCentimos: 850 },
    ], { modalidad: "DINE_IN", nombre: "", telefono: "" });
    expect(registrarPedidoQrAction).toHaveBeenCalledTimes(1);
    expect(controles.setItems).toHaveBeenCalledWith([]);
  });

  it("ignora un doble clic y no permite editar mientras el registro está pendiente", async () => {
    let resolver!: (resultado: ResultadoRegistroPedido) => void;
    vi.mocked(registrarPedidoQrAction).mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const panel = preparar();
    const pendiente = panel.onConfirmar();
    await panel.onConfirmar();
    panel.onEliminar("limonada");
    expect(registrarPedidoQrAction).toHaveBeenCalledTimes(1);
    expect(controles.setItems).not.toHaveBeenCalled();
    resolver({ ok: true, numero: 42 });
    await pendiente;
    expect(controles.setItems).toHaveBeenCalledWith([]);
  });

  it("conserva el carrito y reutiliza la clave UUID tras un error del servidor", async () => {
    vi.mocked(registrarPedidoQrAction).mockResolvedValue({ ok: false, mensaje: "Reintenta." });
    const panel = preparar();
    await panel.onConfirmar();
    await panel.onConfirmar();
    const llamadas = vi.mocked(registrarPedidoQrAction).mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0][1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(llamadas[1][1]).toBe(llamadas[0][1]);
    expect(controles.setItems).not.toHaveBeenCalled();
  });

  it("conserva la clave y permite reintentar tras una interrupción de conexión", async () => {
    vi.mocked(registrarPedidoQrAction).mockRejectedValueOnce(new Error("Conexión interrumpida"))
      .mockResolvedValueOnce({ ok: true, numero: 42 });
    const panel = preparar();
    await panel.onConfirmar();
    expect(controles.setItems).not.toHaveBeenCalled();
    await panel.onConfirmar();
    const llamadas = vi.mocked(registrarPedidoQrAction).mock.calls;
    expect(llamadas[1][1]).toBe(llamadas[0][1]);
    expect(controles.setItems).toHaveBeenCalledWith([]);
  });

  it("renueva la clave si el cliente modifica el carrito después de un error", async () => {
    vi.mocked(registrarPedidoQrAction).mockResolvedValue({ ok: false, mensaje: "Reintenta." });
    const panel = preparar();
    await panel.onConfirmar();
    panel.onCambiarCantidad("limonada", 3);
    expect(controles.setItems).toHaveBeenCalledWith([{ productoId: "limonada", cantidad: 3, observacion: null }]);
    await panel.onConfirmar();
    const llamadas = vi.mocked(registrarPedidoQrAction).mock.calls;
    expect(llamadas[1][1]).not.toBe(llamadas[0][1]);
  });

  it("no contacta al servidor cuando la mesa está deshabilitada", async () => {
    await preparar(false).onConfirmar();
    expect(registrarPedidoQrAction).not.toHaveBeenCalled();
    expect(controles.setItems).not.toHaveBeenCalled();
  });
});
