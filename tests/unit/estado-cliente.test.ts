import { describe, expect, it } from "vitest";
import {
  MENSAJE_ESTADO_CLIENTE,
  mensajeEstadoCliente,
  etiquetaEstadoCliente,
  agregarPedidoGuardado,
  descartarAntiguos,
  pasoDelPedido,
  type PedidoGuardado,
} from "../../src/features/pedidos/estado-cliente";
import { ETIQUETA_ESTADO, type EstadoPedido } from "../../src/features/pedidos/estados";

const AHORA = Date.parse("2026-11-01T18:00:00.000Z");
const HORA = 60 * 60 * 1000;

function crearPedido(
  numero: number,
  antiguedadMs = 0,
): PedidoGuardado {
  return {
    clave: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`,
    numero,
    creadoEn: new Date(AHORA - antiguedadMs).toISOString(),
  };
}

const estados: Array<{
  estado: EstadoPedido;
  mensaje: string;
  paso: number | null;
}> = [
  {
    estado: "PENDING",
    mensaje: "Recibimos tu pedido, en breve lo confirmamos",
    paso: 1,
  },
  {
    estado: "ACCEPTED",
    mensaje: "Tu pedido fue aceptado",
    paso: 2,
  },
  {
    estado: "IN_PROGRESS",
    mensaje: "Estamos preparando tu pedido",
    paso: 3,
  },
  {
    estado: "READY",
    mensaje: "¡Tu pedido está listo!",
    paso: 4,
  },
  {
    estado: "DELIVERED",
    mensaje: "Pedido entregado. ¡Buen provecho!",
    paso: 4,
  },
  {
    estado: "CANCELLED",
    mensaje: "Tu pedido fue cancelado",
    paso: null,
  },
];

describe("mensajes y progreso del pedido", () => {
  it("US-085: explica que el pedido para llevar espera pago antes de prepararse", () => {
    expect(etiquetaEstadoCliente("PENDING", "TAKEAWAY")).toBe("Esperando pago");
    expect(mensajeEstadoCliente("PENDING", "TAKEAWAY")).toBe(
      "Esperando pago. Paga en caja o con tarjeta para que comencemos a preparar tu pedido.",
    );
  });

  it("US-085: conserva las etiquetas y el mensaje pendiente de mesa", () => {
    for (const { estado } of estados) {
      expect(etiquetaEstadoCliente(estado, "DINE_IN")).toBe(ETIQUETA_ESTADO[estado]);
      if (estado !== "PENDING") {
        expect(etiquetaEstadoCliente(estado, "TAKEAWAY")).toBe(ETIQUETA_ESTADO[estado]);
      }
    }
    expect(mensajeEstadoCliente("PENDING", "DINE_IN")).toBe(MENSAJE_ESTADO_CLIENTE.PENDING);
  });

  it("avisa que el mesero lleva el pedido listo a la mesa", () => {
    expect(mensajeEstadoCliente("READY", "DINE_IN")).toBe("Tu pedido está listo, el mesero te lo lleva");
  });

  it("avisa que el pedido para llevar se recoge en mostrador", () => {
    expect(mensajeEstadoCliente("READY", "TAKEAWAY")).toBe("Recógelo en el mostrador");
  });

  it.each(estados.filter(({ estado }) => estado !== "READY" && estado !== "PENDING"))(
    "conserva el mensaje de $estado para ambas modalidades",
    ({ estado, mensaje }) => {
      expect(mensajeEstadoCliente(estado, "DINE_IN")).toBe(mensaje);
      expect(mensajeEstadoCliente(estado, "TAKEAWAY")).toBe(mensaje);
    },
  );
  it.each(estados)(
    "muestra el mensaje de $estado",
    ({ estado, mensaje }) => {
      expect(MENSAJE_ESTADO_CLIENTE[estado]).toBe(mensaje);
    },
  );

  it.each(estados)(
    "devuelve el paso de $estado",
    ({ estado, paso }) => {
      expect(pasoDelPedido(estado)).toBe(paso);
    },
  );
});

describe("descartarAntiguos", () => {
  it("conserva pedidos recientes y los de exactamente 12 horas", () => {
    const recientes = [
      crearPedido(1),
      crearPedido(2, 12 * HORA),
    ];

    expect(descartarAntiguos(recientes, AHORA)).toEqual(recientes);
  });

  it("descarta pedidos de más de 12 horas", () => {
    const vigente = crearPedido(1);

    expect(
      descartarAntiguos(
        [vigente, crearPedido(2, 12 * HORA + 1)],
        AHORA,
      ),
    ).toEqual([vigente]);
  });

  it("descarta fechas futuras e información inválida", () => {
    expect(
      descartarAntiguos(
        [
          null,
          {},
          "pedido",
          crearPedido(1, -1),
          { ...crearPedido(2), creadoEn: "fecha inválida" },
          { ...crearPedido(3), clave: "clave inválida" },
          { ...crearPedido(4), numero: -1 },
        ],
        AHORA,
      ),
    ).toEqual([]);
  });

  it("no modifica la lista original", () => {
    const lista = Object.freeze([
      Object.freeze(crearPedido(1)),
      Object.freeze(crearPedido(2, 13 * HORA)),
    ]);

    expect(descartarAntiguos(lista, AHORA)).toHaveLength(1);
    expect(lista).toHaveLength(2);
  });
});

describe("agregarPedidoGuardado", () => {
  it("agrega el pedido a una lista vacía", () => {
    const nuevo = crearPedido(1);

    expect(agregarPedidoGuardado([], nuevo, AHORA)).toEqual([
      nuevo,
    ]);
  });

  it("no duplica un pedido con la misma clave", () => {
    const nuevo = crearPedido(1);

    expect(
      agregarPedidoGuardado([nuevo, nuevo], nuevo, AHORA),
    ).toEqual([nuevo]);
  });

  it("ordena del más reciente al más antiguo", () => {
    const antiguo = crearPedido(1, 2 * HORA);
    const intermedio = crearPedido(2, HORA);
    const reciente = crearPedido(3);

    expect(
      agregarPedidoGuardado(
        [antiguo, reciente],
        intermedio,
        AHORA,
      ),
    ).toEqual([reciente, intermedio, antiguo]);
  });

  it("conserva como máximo los diez pedidos más recientes", () => {
    const anteriores = Array.from({ length: 10 }, (_, indice) =>
      crearPedido(indice + 1, (indice + 1) * 1000),
    );
    const nuevo = crearPedido(11);

    const resultado = agregarPedidoGuardado(
      anteriores,
      nuevo,
      AHORA,
    );

    expect(resultado).toHaveLength(10);
    expect(resultado[0]).toEqual(nuevo);
    expect(resultado.some((pedido) => pedido.numero === 10)).toBe(false);
  });

  it("descarta los antiguos al agregar otro pedido", () => {
    const nuevo = crearPedido(2);

    expect(
      agregarPedidoGuardado(
        [crearPedido(1, 13 * HORA)],
        nuevo,
        AHORA,
      ),
    ).toEqual([nuevo]);
  });

  it("no modifica los pedidos ni la lista original", () => {
    const anterior = Object.freeze(crearPedido(1, HORA));
    const lista = Object.freeze([anterior]);
    const nuevo = Object.freeze(crearPedido(2));

    const resultado = agregarPedidoGuardado(lista, nuevo, AHORA);

    expect(lista).toEqual([anterior]);
    expect(resultado).toEqual([nuevo, anterior]);
    expect(resultado).not.toBe(lista);
  });
});
