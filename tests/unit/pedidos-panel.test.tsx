import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/features/acceso-qr/acceso", () => ({ resolverAccesoQr: vi.fn() }));
vi.mock("@/features/auth/sesion", () => ({ requerirRol: vi.fn() }));
vi.mock("../../src/features/pedidos/pedidos", () => ({ listarPedidos: vi.fn() }));
vi.mock("../../src/features/pedidos/registro", () => ({ buscarPedidoIdempotente: vi.fn(), guardarPedidoQr: vi.fn() }));
vi.mock("../../src/features/pedidos/validar-pedido", () => ({ validarPedido: vi.fn() }));

import { requerirRol } from "@/features/auth/sesion";
import { listarPedidos } from "../../src/features/pedidos/pedidos";
import { listarPedidosCocinaAction, listarPedidosMeseroAction } from "../../src/features/pedidos/actions";
import { PedidosLista } from "../../src/features/pedidos/pedidos-lista";
import type { PedidoListado } from "../../src/features/pedidos/pedidos";

const pedido: PedidoListado = {
  id: "pedido-1",
  numero: 104,
  modalidad: "DINE_IN",
  estado: "PENDING",
  total: 25,
  creadoEn: "2026-10-26T15:30:00.000Z",
  mesa: 7,
  lineas: [{
    id: "linea-1",
    producto: "Ceviche clásico",
    cantidad: 2,
    precioUnitario: 12.5,
    subtotal: 25,
    observacion: "Sin ají",
  }],
};

beforeEach(() => vi.resetAllMocks());

describe("consultas autorizadas de pedidos para mesero y cocina", () => {
  it("limita la consulta de mesero a su restaurante y los roles permitidos", async () => {
    vi.mocked(requerirRol).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "restaurante-a", branchId: null, rol: "WAITER" }],
    });
    vi.mocked(listarPedidos).mockResolvedValue([pedido]);

    await expect(listarPedidosMeseroAction("restaurante-a")).resolves.toEqual([pedido]);
    expect(requerirRol).toHaveBeenCalledWith(["WAITER", "OWNER", "ADMIN"]);
    expect(listarPedidos).toHaveBeenCalledWith("restaurante-a");
  });

  it("limita la consulta de cocina a su restaurante y los roles permitidos", async () => {
    vi.mocked(requerirRol).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "restaurante-a", branchId: null, rol: "KITCHEN" }],
    });
    vi.mocked(listarPedidos).mockResolvedValue([pedido]);

    await expect(listarPedidosCocinaAction("restaurante-a")).resolves.toEqual([pedido]);
    expect(requerirRol).toHaveBeenCalledWith(["KITCHEN", "OWNER", "ADMIN"]);
    expect(listarPedidos).toHaveBeenCalledWith("restaurante-a");
  });

  it("rechaza un restaurante distinto a las membresías del usuario", async () => {
    vi.mocked(requerirRol).mockResolvedValue({
      usuario: {} as never,
      membresias: [{ restaurantId: "restaurante-a", branchId: null, rol: "KITCHEN" }],
    });

    await expect(listarPedidosCocinaAction("restaurante-b")).rejects.toThrow("Sin permiso");
    expect(listarPedidos).not.toHaveBeenCalled();
  });
});

describe("vista de los pedidos recibidos", () => {
  it("muestra los datos del pedido que necesitan mesero y cocina", () => {
    const html = renderToStaticMarkup(<PedidosLista pedidos={[pedido]} />);
    expect(html).toContain("Pedido #104");
    expect(html).toContain("En mesa 7");
    expect(html).toContain("Ceviche clásico");
    expect(html).toContain("2 ×");
    expect(html).toContain("Sin ají");
    expect(html).toContain("Pendiente");
    expect(html).toContain("Total:");
    expect(html).toContain("26 oct. 2026");
  });

  it("identifica los pedidos para llevar y la ausencia de mesa", () => {
    const paraLlevar = { ...pedido, modalidad: "TAKEAWAY" as const, mesa: null };
    const html = renderToStaticMarkup(<PedidosLista pedidos={[paraLlevar]} />);
    expect(html).toContain("Para llevar");
    expect(html).not.toContain("En mesa");
  });
});
