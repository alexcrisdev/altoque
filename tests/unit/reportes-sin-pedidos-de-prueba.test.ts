import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("../../src/lib/supabase/admin", () => ({ crearClienteAdmin: vi.fn() }));

import { crearClienteServidor } from "../../src/lib/supabase/server";
import { crearClienteAdmin } from "../../src/lib/supabase/admin";
import {
  cuentaDePrueba, esPedidoDePrueba, obtenerIdsPedidosDePrueba, sesionesSoloDePrueba,
} from "../../src/features/dashboard/pedidos-de-prueba";
import { obtenerFilasVentasCsv } from "../../src/features/dashboard/ventas-csv";
import { obtenerResumenVentas } from "../../src/features/dashboard/ventas";
import { obtenerResumenDiario } from "../../src/features/dashboard/resumen-diario";
import { obtenerSatisfaccionDia } from "../../src/features/dashboard/satisfaccion";
import { obtenerTendencias } from "../../src/features/dashboard/tendencias";

const restaurante = "10000000-0000-0000-0000-000000000001";
const dia = "2026-11-15";
const fecha = `${dia}T17:00:00Z`;
const pruebaPorNombre = "prueba-nombre";
const pruebaPorNota = "prueba-nota";

const pedidosDeSesiones = [
  { id: pruebaPorNota, table_session_id: "solo-prueba" },
  { id: "otra-prueba", table_session_id: "mixta" },
  { id: "real-de-ayer", table_session_id: "mixta" },
];

type Lectura = {
  tabla: string;
  columnas: string;
  filtros: [string, string, unknown][];
  orden: string;
  rango: [number, number];
};
type Pagina = { data: unknown[] | null; count: number | null; error: object | null };

function pagina(data: unknown[], count = data.length): Pagina {
  return { data, count, error: null };
}

function simular(responder: (lectura: Lectura) => Pagina) {
  const lecturas: Lectura[] = [];
  const cliente = {
    from(tabla: string) {
      const lectura: Lectura = { tabla, columnas: "", filtros: [], orden: "", rango: [0, 0] };
      const consulta = {
        select(columnas: string) { lectura.columnas = columnas; return consulta; },
        eq(campo: string, valor: unknown) { lectura.filtros.push(["eq", campo, valor]); return consulta; },
        neq(campo: string, valor: unknown) { lectura.filtros.push(["neq", campo, valor]); return consulta; },
        like(campo: string, valor: unknown) { lectura.filtros.push(["like", campo, valor]); return consulta; },
        in(campo: string, valor: unknown) { lectura.filtros.push(["in", campo, valor]); return consulta; },
        gte(campo: string, valor: unknown) { lectura.filtros.push(["gte", campo, valor]); return consulta; },
        lt(campo: string, valor: unknown) { lectura.filtros.push(["lt", campo, valor]); return consulta; },
        order(campo: string) { lectura.orden = campo; return consulta; },
        range(desde: number, hasta: number) { lectura.rango = [desde, hasta]; return consulta; },
        overrideTypes() { return consulta; },
        then(resolve: (respuesta: Pagina) => void) {
          lecturas.push(lectura);
          resolve(responder(lectura));
        },
        async maybeSingle() { return { data: { id: restaurante, name: "Demo" }, error: null }; },
      };
      return consulta;
    },
  };
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never);
  vi.mocked(crearClienteAdmin).mockReturnValue(cliente as never);
  return { lecturas, cliente: cliente as unknown as ReturnType<typeof crearClienteAdmin> };
}

function datosDePrueba(lectura: Lectura): Pagina {
  if (lectura.tabla === "order_items") {
    return pagina([{ order_id: pruebaPorNota }, { order_id: pruebaPorNota }, { order_id: "otra-prueba" }]);
  }
  if (lectura.filtros.some(([op]) => op === "like")) return pagina([{ id: pruebaPorNombre }]);
  if (lectura.columnas === "id, table_session_id") return pagina(pedidosDeSesiones);
  return pagina([]);
}

function pago(id: string, pedido: string | null, sesion: string | null, amount: number) {
  return {
    id, restaurant_id: restaurante, order_id: pedido, table_session_id: sesion,
    amount, status: "CONFIRMED", method: "CASH", confirmed_at: fecha, stripe_session_id: null,
  };
}

function pedido(id: string, nombre: string) {
  return {
    id, restaurant_id: restaurante, status: "READY", created_at: fecha,
    order_items: [{ product_id: id, product_name: nombre, quantity: 1 }],
  };
}

beforeEach(() => vi.resetAllMocks());

describe("US-111", () => {
  it("consulta solo los IDs, por restaurante y prefijo exacto, con orden estable", async () => {
    const { cliente, lecturas } = simular((lectura) => {
      if (lectura.tabla === "orders") return lectura.rango[0] === 0
        ? pagina([{ id: pruebaPorNombre }], 2)
        : pagina([{ id: pruebaPorNota }], 2);
      return datosDePrueba(lectura);
    });
    const ids = await obtenerIdsPedidosDePrueba(cliente, restaurante);
    expect(ids).toEqual(new Set([pruebaPorNombre, pruebaPorNota, "otra-prueba"]));
    expect(esPedidoDePrueba("real", ids)).toBe(false);
    expect(lecturas.filter((q) => q.tabla === "orders").map((q) => q.rango)).toEqual([[0, 499], [1, 500]]);
    expect(lecturas.filter((q) => q.tabla === "orders")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columnas: "id", orden: "id",
        filtros: [["eq", "restaurant_id", restaurante], ["like", "customer_name", "PRUEBA E2E%"]],
      }),
    ]));
    expect(lecturas.find((q) => q.tabla === "order_items")).toMatchObject({
      columnas: "order_id, orders!inner(restaurant_id)", orden: "id",
      filtros: [["eq", "orders.restaurant_id", restaurante], ["like", "observation", "PRUEBA E2E%"]],
    });
  });

  it("conserva cuentas de sesión mixta o vacía y excluye las ligadas solo a pruebas", () => {
    const ids = new Set([pruebaPorNombre, pruebaPorNota, "otra-prueba"]);
    const sesiones = sesionesSoloDePrueba(pedidosDeSesiones, ids);
    expect(cuentaDePrueba({ order_id: pruebaPorNombre, table_session_id: null }, ids, sesiones)).toBe(true);
    expect(cuentaDePrueba({ order_id: null, table_session_id: "solo-prueba" }, ids, sesiones)).toBe(true);
    expect(cuentaDePrueba({ order_id: null, table_session_id: "mixta" }, ids, sesiones)).toBe(false);
    expect(cuentaDePrueba({ order_id: null, table_session_id: "vacia" }, ids, sesiones)).toBe(false);
  });

  it("ventas y CSV excluyen pagos de prueba y conservan el monto entero de la sesión mixta", async () => {
    const { lecturas } = simular((lectura) => lectura.tabla === "payments" ? pagina([
      pago("real", "pedido-real", null, 12.50),
      pago("pago-prueba-pedido", pruebaPorNombre, null, 100),
      pago("pago-prueba-sesion", null, "solo-prueba", 200),
      pago("pago-mixto", null, "mixta", 27.50),
    ]) : datosDePrueba(lectura));

    const ventas = await obtenerResumenVentas(restaurante, dia, dia);
    const filas = await obtenerFilasVentasCsv(restaurante, dia, dia);
    expect(filas.map((fila) => [fila.pagoId, fila.importeCentimos])).toEqual([["real", 1250], ["pago-mixto", 2750]]);
    expect(ventas.ventasCentimos).toBe(4000);
    expect(filas.reduce((total, fila) => total + fila.importeCentimos, 0)).toBe(ventas.ventasCentimos);
    expect(lecturas.filter((q) => q.columnas === "id, table_session_id")).toEqual([
      expect.objectContaining({
        filtros: [["eq", "restaurant_id", restaurante], ["in", "table_session_id", ["solo-prueba", "mixta"]]],
      }),
      expect.objectContaining({
        filtros: [["eq", "restaurant_id", restaurante], ["in", "table_session_id", ["solo-prueba", "mixta"]]],
      }),
    ]);
  });

  it("top y tendencias cuentan solo el pedido real", async () => {
    simular((lectura) => lectura.tabla === "orders" && lectura.columnas.includes("product_name")
      ? pagina([pedido("real", "Ceviche"), pedido(pruebaPorNota, "Arroz")]) : datosDePrueba(lectura));
    const tendencias = await obtenerTendencias(restaurante, dia, dia);
    expect(tendencias.total).toBe(1);
    expect(tendencias.productos).toEqual([{ productId: "real", nombre: "Ceviche", unidades: 1 }]);
  });

  it("el resumen excluye pedidos, pagos y cierres de prueba", async () => {
    const cierre = { restaurant_id: restaurante, kind: "EXCEPTION", closed_at: fecha };
    simular((lectura) => {
      if (lectura.tabla === "account_closures") return pagina([
        { ...cierre, id: "c1", reason: "Cierre de prueba por pedido", order_id: pruebaPorNombre, table_session_id: null },
        { ...cierre, id: "c2", reason: "Cierre de prueba por sesión", order_id: null, table_session_id: "solo-prueba" },
        { ...cierre, id: "c3", reason: "Cierre de sesión mixta", order_id: null, table_session_id: "mixta" },
      ]);
      if (lectura.tabla === "payments") return pagina([
        pago("p1", "real", null, 12.50), pago("p2", pruebaPorNombre, null, 100),
      ]);
      if (lectura.tabla === "orders" && lectura.columnas.includes("product_name")) {
        return pagina([pedido("real", "Ceviche"), pedido(pruebaPorNota, "Arroz")]);
      }
      return datosDePrueba(lectura);
    });
    expect(await obtenerResumenDiario(restaurante, dia)).toMatchObject({
      total_vendido: 12.5,
      pedidos: 1,
      plato_mas_vendido: { nombre: "Ceviche", cantidad: 1 },
      cierres_con_excepcion: { cantidad: 1, motivos: ["Cierre de sesión mixta"] },
    });
  });

  it("avanza por las filas leídas de satisfacción aunque descarte toda la primera página", async () => {
    const { lecturas } = simular((lectura) => {
      if (lectura.tabla !== "order_ratings") return datosDePrueba(lectura);
      return lectura.rango[0] === 0
        ? pagina(Array.from({ length: 500 }, () => ({ order_id: pruebaPorNombre, service_stars: 1, waiter_stars: 2 })))
        : pagina([{ order_id: "real", service_stars: 5, waiter_stars: 4 }]);
    });
    expect(await obtenerSatisfaccionDia(restaurante, dia)).toEqual({ cantidad: 1, servicio: 5, mesero: 4 });
    const consultas = lecturas.filter((q) => q.tabla === "order_ratings");
    expect(consultas.map((q) => q.rango)).toEqual([[0, 499], [500, 999]]);
    expect(consultas[0].columnas).toBe("service_stars,waiter_stars,order_id");
  });

  it("devuelve satisfacción nula cuando solo hay calificaciones de prueba", async () => {
    simular((lectura) => lectura.tabla === "order_ratings"
      ? pagina([{ order_id: pruebaPorNota, service_stars: 1, waiter_stars: 1 }]) : datosDePrueba(lectura));
    expect(await obtenerSatisfaccionDia(restaurante, dia)).toEqual({ cantidad: 0, servicio: null, mesero: null });
  });

  it("propaga el error de consultar IDs e impide mostrar ventas sin filtrar", async () => {
    const { cliente } = simular((lectura) => {
      if (lectura.tabla === "order_items") return { data: null, count: null, error: { code: "DENIED" } };
      if (lectura.tabla === "payments") return pagina([pago("p", "real", null, 12.50)]);
      return datosDePrueba(lectura);
    });
    await expect(obtenerIdsPedidosDePrueba(cliente, restaurante)).rejects.toThrow("pedidos de prueba");
    await expect(obtenerResumenVentas(restaurante, dia, dia)).rejects.toThrow("No se pudieron consultar las ventas");
    await expect(obtenerFilasVentasCsv(restaurante, dia, dia)).rejects.toThrow("No se pudieron consultar las ventas");
  });
});
