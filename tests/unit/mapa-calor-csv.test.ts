import { describe, expect, it } from "vitest";
import { leerPedidosSinteticos } from "../../src/features/dashboard/mapa-calor-csv";
import { calcularMapaCalor } from "../../src/features/dashboard/mapa-calor-logica";

const pedidos =
  "pedido_id,creado_en,estado\np1,2026-05-04T12:30,DELIVERED\n";

const lineas =
  "pedido_id,producto_id,producto,cantidad\np1,P01,Ceviche,2\n";

describe("CSV del mapa de calor US-084", () => {
  it("lee los CSV y convierte las fechas locales a Lima con zona explícita", () => {
    const resultado = leerPedidosSinteticos(pedidos, lineas);

    expect(resultado.pedidos).toEqual([{
      id: "p1",
      creadoEn: "2026-05-04T12:30-05:00",
      cancelado: false,
      productos: ["P01"],
    }]);

    expect(resultado.productos).toEqual([
      { id: "P01", nombre: "Ceviche" },
    ]);
    expect(resultado.desde).toBe("2026-05-04");
    expect(resultado.hasta).toBe("2026-05-04");

    const mapa = calcularMapaCalor(resultado.pedidos, {
      desde: resultado.desde,
      hasta: resultado.hasta,
      horaDesde: 11,
      horaHasta: 22,
      diasAbiertos: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(
      mapa.celdas.find((celda) => celda.dia === 0 && celda.hora === 12)?.pedidos,
    ).toBe(1);
  });

  it("acepta BOM, CRLF, comas y comillas dentro del nombre", () => {
    const texto =
      '\uFEFFpedido_id,producto_id,producto,cantidad\r\np1,P01,"Ceviche, ""clásico""",2\r\n';

    expect(
      leerPedidosSinteticos(pedidos, texto).productos[0].nombre,
    ).toBe('Ceviche, "clásico"');
  });

  it("conserva el pedido una vez aunque el plato tenga varias líneas", () => {
    const resultado = leerPedidosSinteticos(
      pedidos,
      lineas + "p1,P01,Ceviche,1\n",
    );

    expect(resultado.pedidos).toHaveLength(1);
    expect(resultado.pedidos[0].productos).toEqual(["P01"]);
  });

  it("conserva cancelados para que el cálculo pueda excluirlos", () => {
    const resultado = leerPedidosSinteticos(
      pedidos.replace("DELIVERED", "CANCELLED"),
      lineas,
    );

    expect(resultado.pedidos[0].cancelado).toBe(true);
    expect(resultado.productos).toEqual([]);
  });

  it("rechaza líneas de otro conjunto de pedidos", () => {
    expect(() => leerPedidosSinteticos(
      pedidos,
      lineas.replace("p1,P01", "p2,P01"),
    )).toThrow("inexistente");
  });

  it("rechaza pedidos duplicados", () => {
    expect(() => leerPedidosSinteticos(
      pedidos + "p1,2026-05-04T13:00,DELIVERED\n",
      lineas,
    )).toThrow("duplicados");
  });

  it("rechaza pedidos sin líneas", () => {
    expect(() => leerPedidosSinteticos(
      pedidos + "p2,2026-05-04T13:00,DELIVERED\n",
      lineas,
    )).toThrow("sin líneas");
  });

  it("rechaza columnas ausentes", () => {
    expect(() => leerPedidosSinteticos(
      pedidos.replace("estado", "otro"),
      lineas,
    )).toThrow("Faltan columnas");
  });

  it("rechaza cabeceras duplicadas", () => {
    expect(() => leerPedidosSinteticos(
      pedidos.replace("estado", "pedido_id"),
      lineas,
    )).toThrow("cabecera");
  });

  it("rechaza comillas sin cerrar", () => {
    expect(() => leerPedidosSinteticos(
      pedidos,
      lineas + 'p1,P02,"Pota,1',
    )).toThrow("comillas");
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "rechaza la cantidad %s",
    (cantidad) => {
      expect(() => leerPedidosSinteticos(
        pedidos,
        lineas.replace("Ceviche,2", `Ceviche,${cantidad}`),
      )).toThrow("líneas inválidas");
    },
  );

  it("rechaza fechas de calendario inválidas", () => {
    expect(() => leerPedidosSinteticos(
      pedidos.replace("2026-05-04", "2026-02-30"),
      lineas,
    )).toThrow("fecha inválida");
  });

  it.each(["", "x".repeat(5_000_001)])(
    "rechaza un archivo vacío o demasiado grande",
    (texto) => {
      expect(() => leerPedidosSinteticos(
        texto,
        lineas,
      )).toThrow("límite");
    },
  );
});