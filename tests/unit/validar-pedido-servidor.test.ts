import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerProductosVigentes } from "../../src/features/pedidos/productos";
import { validarPedido } from "../../src/features/pedidos/validar-pedido";

const restauranteId = "11111111-1111-1111-1111-111111111111";
const otroRestauranteId = "22222222-2222-2222-2222-222222222222";
const productoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const productoAjenoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const item = { productoId, cantidad: 2, observacion: null, precioMostradoCentimos: 3290 };

type Fila = {
  id: string;
  restaurant_id: string;
  name: string;
  price: number | string;
  active: boolean;
  available: boolean;
};

function simularConsulta(filas: Fila[], error: object | null = null) {
  let restaurante: string;
  let ids: string[];
  const consulta = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((campo: string, valor: string) => {
      expect(campo).toBe("restaurant_id");
      restaurante = valor;
      return consulta;
    }),
    in: vi.fn((campo: string, valores: string[]) => {
      expect(campo).toBe("id");
      ids = valores;
      return consulta;
    }),
    returns: vi.fn(async () => ({
      data: filas.filter((fila) => fila.restaurant_id === restaurante && ids.includes(fila.id)),
      error,
    })),
  };
  // El doble solo reproduce la consulta de lectura utilizada por esta capa.
  vi.mocked(crearClienteAdmin).mockReturnValue(consulta as unknown as ReturnType<typeof crearClienteAdmin>);
  return consulta;
}

const fila: Fila = {
  id: productoId, restaurant_id: restauranteId, name: "Ceviche clásico",
  price: "32.90", active: true, available: true,
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("validación del pedido en servidor", () => {
  it("no consulta productos cuando la estructura es inválida", async () => {
    expect(await validarPedido(restauranteId, [{ ...item, cantidad: 0 }])).toEqual({
      ok: false, problemas: [], motivo: "DATOS_INVALIDOS",
    });
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });

  it("consulta solo las columnas necesarias y filtra por restaurante e IDs", async () => {
    const consulta = simularConsulta([fila, { ...fila, id: productoAjenoId }]);
    expect(await validarPedido(restauranteId, [item])).toEqual({
      ok: true,
      lineas: [{ productoId, nombre: fila.name, cantidad: 2, observacion: null, precioUnitarioCentimos: 3290, subtotalCentimos: 6580 }],
      totalCentimos: 6580,
    });
    expect(consulta.from).toHaveBeenCalledExactlyOnceWith("products");
    expect(consulta.select).toHaveBeenCalledExactlyOnceWith("id, name, price, active, available");
    expect(consulta.eq).toHaveBeenCalledExactlyOnceWith("restaurant_id", restauranteId);
    expect(consulta.in).toHaveBeenCalledExactlyOnceWith("id", [productoId]);
  });

  it("trata un producto de otro restaurante como inexistente", async () => {
    simularConsulta([fila, { ...fila, id: productoAjenoId, restaurant_id: otroRestauranteId }]);
    expect(await validarPedido(restauranteId, [{ ...item, productoId: productoAjenoId }])).toEqual({
      ok: false, problemas: [{ productoId: productoAjenoId, motivo: "NO_EXISTE" }],
    });
  });

  it("consulta IDs sin duplicarlos y conserva las líneas del pedido", async () => {
    const consulta = simularConsulta([fila]);
    const resultado = await validarPedido(restauranteId, [item, { ...item, observacion: "Sin ají" }]);
    expect(consulta.in).toHaveBeenCalledExactlyOnceWith("id", [productoId]);
    expect(resultado).toMatchObject({ ok: true, totalCentimos: 13160 });
    if (!resultado.ok) throw new Error("Se esperaba un pedido válido");
    expect(resultado.lineas).toHaveLength(2);
  });

  it("recupera inactivos y agotados para informar todos los motivos", async () => {
    simularConsulta([{ ...fila, active: false, available: false, price: 34 }]);
    expect(await validarPedido(restauranteId, [item])).toEqual({
      ok: false,
      problemas: [
        { productoId, nombre: fila.name, motivo: "INACTIVO" },
        { productoId, nombre: fila.name, motivo: "AGOTADO" },
        { productoId, nombre: fila.name, motivo: "PRECIO_CAMBIO", precioActualCentimos: 3400 },
      ],
    });
  });

  it("registra solo el código de error y no devuelve un pedido válido", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    simularConsulta([], { code: "XX001", message: "Datos privados", details: "Datos privados" });
    await expect(validarPedido(restauranteId, [item])).rejects.toThrow("No se pudieron consultar los productos del pedido.");
    expect(registro).toHaveBeenCalledExactlyOnceWith("XX001");
  });

  it("oculta errores de configuración sin registrar sus mensajes", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(crearClienteAdmin).mockImplementation(() => { throw new Error("Configuración privada"); });
    await expect(validarPedido(restauranteId, [item])).rejects.toThrow("No se pudieron consultar los productos del pedido.");
    expect(registro).not.toHaveBeenCalled();
  });

  it("no consulta si no hay IDs solicitados", async () => {
    expect(await obtenerProductosVigentes(restauranteId, [])).toEqual([]);
    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });
});
