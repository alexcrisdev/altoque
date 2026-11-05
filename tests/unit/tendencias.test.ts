import { describe, expect, it } from "vitest";
import {
  calcularProductosMasVendidos,
  contarPedidosPorEstado,
  ESTADOS_TENDENCIAS,
  type PedidoTendencia,
} from "../../src/features/dashboard/tendencias-logica";

function crearPedido(
  cambios: Partial<PedidoTendencia> = {},
): PedidoTendencia {
  return {
    id: "pedido-1",
    created_at: "2026-11-04T15:00:00.000Z",
    status: "PENDING",
    order_items: [
      {
        product_id: "producto-1",
        product_name: "Ceviche",
        quantity: 2,
      },
    ],
    ...cambios,
  };
}

describe("productos más vendidos US-019", () => {
  it("excluye pedidos cancelados del top", () => {
    const resultado = calcularProductosMasVendidos([
      crearPedido(),
      crearPedido({ id: "cancelado", status: "CANCELLED" }),
    ]);

    expect(resultado).toEqual([
      { productId: "producto-1", nombre: "Ceviche", unidades: 2 },
    ]);
  });

  it("suma un producto presente en varios pedidos y líneas", () => {
    const resultado = calcularProductosMasVendidos([
      crearPedido(),
      crearPedido({
        id: "pedido-2",
        order_items: [
          {
            product_id: "producto-1",
            product_name: "Ceviche",
            quantity: 3,
          },
          {
            product_id: "producto-1",
            product_name: "Ceviche",
            quantity: 1,
          },
        ],
      }),
    ]);

    expect(resultado[0].unidades).toBe(6);
  });

  it.each([
    "PENDING",
    "ACCEPTED",
    "IN_PROGRESS",
    "READY",
    "DELIVERED",
  ] as const)("incluye las unidades del estado %s", (status) => {
    expect(
      calcularProductosMasVendidos([crearPedido({ status })])[0]
        .unidades,
    ).toBe(2);
  });

  it("devuelve los cinco primeros por unidades", () => {
    const pedidos = Array.from({ length: 7 }, (_, indice) =>
      crearPedido({
        id: `pedido-${indice}`,
        order_items: [
          {
            product_id: `producto-${indice}`,
            product_name: `Producto ${indice}`,
            quantity: indice + 1,
          },
        ],
      }),
    );

    expect(
      calcularProductosMasVendidos(pedidos).map((p) => p.unidades),
    ).toEqual([7, 6, 5, 4, 3]);
  });

  it("desempata alfabéticamente por nombre", () => {
    const pedidos = ["Chicha", "Arroz", "Ceviche"].map(
      (nombre, indice) =>
        crearPedido({
          id: `pedido-${indice}`,
          order_items: [
            {
              product_id: `producto-${indice}`,
              product_name: nombre,
              quantity: 2,
            },
          ],
        }),
    );

    expect(
      calcularProductosMasVendidos(pedidos).map((p) => p.nombre),
    ).toEqual(["Arroz", "Ceviche", "Chicha"]);
  });

  it("usa el nombre más reciente aunque los pedidos estén desordenados", () => {
    const reciente = crearPedido({
      id: "pedido-reciente",
      created_at: "2026-11-04T17:00:00.000Z",
      order_items: [
        {
          product_id: "producto-1",
          product_name: "Ceviche especial",
          quantity: 3,
        },
      ],
    });

    const esperado = [
      {
        productId: "producto-1",
        nombre: "Ceviche especial",
        unidades: 5,
      },
    ];

    expect(
      calcularProductosMasVendidos([reciente, crearPedido()]),
    ).toEqual(esperado);

    expect(
      calcularProductosMasVendidos([crearPedido(), reciente]),
    ).toEqual(esperado);
  });

  it("un cancelado reciente no cambia el nombre del producto", () => {
    const cancelado = crearPedido({
      id: "cancelado",
      status: "CANCELLED",
      created_at: "2026-11-04T18:00:00.000Z",
      order_items: [
        {
          product_id: "producto-1",
          product_name: "Nombre cancelado",
          quantity: 10,
        },
      ],
    });

    expect(
      calcularProductosMasVendidos([crearPedido(), cancelado]),
    ).toEqual([
      { productId: "producto-1", nombre: "Ceviche", unidades: 2 },
    ]);
  });

  it("agrupa por ID y conserva separados productos con el mismo nombre", () => {
    const resultado = calcularProductosMasVendidos([
      crearPedido(),
      crearPedido({
        id: "pedido-2",
        order_items: [
          {
            product_id: "producto-2",
            product_name: "Ceviche",
            quantity: 1,
          },
        ],
      }),
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado.map((p) => p.productId)).toEqual([
      "producto-1",
      "producto-2",
    ]);
  });

  it("respeta un límite personalizado", () => {
    expect(
      calcularProductosMasVendidos([crearPedido()], 1),
    ).toHaveLength(1);
  });

  it("sin pedidos o con todos cancelados devuelve una lista vacía", () => {
    expect(calcularProductosMasVendidos([])).toEqual([]);
    expect(
      calcularProductosMasVendidos([
        crearPedido({ status: "CANCELLED" }),
      ]),
    ).toEqual([]);
  });

  it("no modifica los pedidos originales", () => {
    const pedido = crearPedido();
    const copia = JSON.stringify(pedido);

    calcularProductosMasVendidos(Object.freeze([pedido]));

    expect(JSON.stringify(pedido)).toBe(copia);
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rechaza el límite inválido %s",
    (limite) => {
      expect(() =>
        calcularProductosMasVendidos([], limite),
      ).toThrow("límite");
    },
  );
});

describe("conteo por estado US-019", () => {
  it("devuelve siempre los seis estados en el orden definido", () => {
    const resultado = contarPedidosPorEstado([]);

    expect(Object.keys(resultado.porEstado)).toEqual(
      ESTADOS_TENDENCIAS,
    );
    expect(Object.values(resultado.porEstado)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(resultado.total).toBe(0);
  });

  it("cuenta todos los estados e incluye los cancelados en el total", () => {
    const pedidos = ESTADOS_TENDENCIAS.map((status, indice) =>
      crearPedido({ id: `pedido-${indice}`, status }),
    );

    const resultado = contarPedidosPorEstado([
      ...pedidos,
      crearPedido({ id: "pendiente-extra" }),
    ]);

    expect(resultado).toEqual({
      porEstado: {
        PENDING: 2,
        ACCEPTED: 1,
        IN_PROGRESS: 1,
        READY: 1,
        DELIVERED: 1,
        CANCELLED: 1,
      },
      total: 7,
    });
  });

  it("cuenta pedidos y no la cantidad de productos", () => {
    expect(contarPedidosPorEstado([crearPedido()])).toMatchObject({
      porEstado: { PENDING: 1 },
      total: 1,
    });
  });
});

describe("validación de datos US-019", () => {
  it("rechaza estados desconocidos en ambas funciones", () => {
    const pedido = crearPedido({
      status: "DESCONOCIDO" as PedidoTendencia["status"],
    });

    expect(() =>
      calcularProductosMasVendidos([pedido]),
    ).toThrow("estado");

    expect(() =>
      contarPedidosPorEstado([pedido]),
    ).toThrow("estado");
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rechaza la cantidad inválida %s",
    (quantity) => {
      const pedido = crearPedido({
        order_items: [
          {
            product_id: "producto-1",
            product_name: "Ceviche",
            quantity,
          },
        ],
      });

      expect(() =>
        calcularProductosMasVendidos([pedido]),
      ).toThrow("cantidad");

      expect(() =>
        contarPedidosPorEstado([pedido]),
      ).toThrow("cantidad");
    },
  );

  it("rechaza fechas inválidas", () => {
    const pedido = crearPedido({ created_at: "fecha inválida" });

    expect(() =>
      calcularProductosMasVendidos([pedido]),
    ).toThrow("datos del pedido");
  });

  it.each([
    { product_id: "", product_name: "Ceviche", quantity: 1 },
    { product_id: "producto-1", product_name: "   ", quantity: 1 },
  ])("rechaza productos sin ID o nombre", (item) => {
    expect(() =>
      calcularProductosMasVendidos([
        crearPedido({ order_items: [item] }),
      ]),
    ).toThrow("datos del producto");
  });
});
