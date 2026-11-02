import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  crearClienteAdmin: vi.fn(),
}));

vi.mock("@/features/acceso-qr/acceso", () => ({
  resolverAccesoQr: vi.fn(),
}));

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { resolverAccesoQr } from "@/features/acceso-qr/acceso";
import { consultarPedidoCliente } from "../../src/features/pedidos/estado-cliente-servidor";

const token = "demo-mesa-1";
const clave = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const acceso = {
  estado: "VALIDO" as const,
  qrId: "qr-mesa-1",
  modalidad: "DINE_IN" as const,
  restauranteId: "restaurante-1",
  restauranteNombre: "Restaurante Demo",
  localId: "local-1",
  localNombre: "Local Centro",
  mesa: { id: "mesa-1", numero: 1 },
};

const filaPedido = {
  id: "pedido-interno-1",
  restaurant_id: acceso.restauranteId,
  qr_code_id: acceso.qrId,
  idempotency_key: clave,
  order_number: 42,
  status: "PENDING",
  created_at: "2026-11-01T18:00:00.000Z",
  modality: "DINE_IN",
  dining_tables: { number: 1 },
  order_items: [
    { product_name: "Ceviche clásico", quantity: 2 },
  ],
};

type Fila = Record<string, unknown>;

type ErrorConsulta = {
  code: string;
  message?: string;
};

function crearConsulta(
  filas: Fila[],
  error: ErrorConsulta | null = null,
) {
  const filtros = new Map<string, unknown>();
  let orden: { campo: string; ascendente: boolean } | null = null;
  let limite: number | null = null;

  const consulta = {
    select: vi.fn().mockReturnThis(),

    eq: vi.fn((campo: string, valor: unknown) => {
      filtros.set(campo, valor);
      return consulta;
    }),

    order: vi.fn((
      campo: string,
      opciones: { ascending: boolean },
    ) => {
      orden = { campo, ascendente: opciones.ascending };
      return consulta;
    }),

    limit: vi.fn((cantidad: number) => {
      limite = cantidad;
      return consulta;
    }),

    maybeSingle: vi.fn().mockReturnThis(),

    overrideTypes: vi.fn(async () => {
      let resultados = filas.filter((fila) =>
        [...filtros].every(
          ([campo, valor]) => fila[campo] === valor,
        ),
      );

      if (orden) {
        const { campo, ascendente } = orden;

        resultados = [...resultados].sort((primero, segundo) => {
          const comparacion = String(primero[campo]).localeCompare(
            String(segundo[campo]),
          );

          return ascendente ? comparacion : -comparacion;
        });
      }

      if (limite !== null) {
        resultados = resultados.slice(0, limite);
      }

      return {
        data: error ? null : resultados[0] ?? null,
        error,
      };
    }),
  };

  return consulta;
}

function simularSupabase(
  pedidos: Fila[] = [filaPedido],
  historial: Fila[] = [],
  errorPedido: ErrorConsulta | null = null,
  errorHistorial: ErrorConsulta | null = null,
) {
  const consultaPedidos = crearConsulta(pedidos, errorPedido);
  const consultaHistorial = crearConsulta(historial, errorHistorial);

  const cliente = {
    from: vi.fn((tabla: string) => {
      if (tabla === "orders") return consultaPedidos;
      if (tabla === "order_status_history") return consultaHistorial;

      throw new Error(`Consulta no permitida en esta prueba: ${tabla}`);
    }),
  };

  vi.mocked(crearClienteAdmin).mockReturnValue(
    cliente as unknown as ReturnType<typeof crearClienteAdmin>,
  );

  return {
    cliente,
    consultaPedidos,
    consultaHistorial,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolverAccesoQr).mockResolvedValue(acceso);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consulta del estado del pedido del cliente", () => {
  it.each(["", "clave-invalida", "42"])(
    "rechaza la clave inválida %s sin consultar datos",
    async (valor) => {
      expect(await consultarPedidoCliente(token, valor)).toBeNull();

      expect(resolverAccesoQr).not.toHaveBeenCalled();
      expect(crearClienteAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(["INVALIDO", "DESHABILITADO"] as const)(
    "no consulta pedidos cuando el QR está %s",
    async (estado) => {
      vi.mocked(resolverAccesoQr).mockResolvedValue({ estado });

      expect(await consultarPedidoCliente(token, clave)).toBeNull();
      expect(crearClienteAdmin).not.toHaveBeenCalled();
    },
  );

  it("filtra por restaurante, QR y clave, y devuelve solo datos permitidos", async () => {
    const { cliente, consultaPedidos } = simularSupabase([
      {
        ...filaPedido,
        customer_name: "Dato privado",
        customer_phone: "999999999",
        created_by: "usuario-interno",
        total: 64,
      },
    ]);

    expect(await consultarPedidoCliente(token, clave)).toEqual({
      numero: 42,
      estado: "PENDING",
      creadoEn: filaPedido.created_at,
      modalidad: "DINE_IN",
      mesaNumero: 1,
      items: [{ nombre: "Ceviche clásico", cantidad: 2 }],
      motivo: null,
    });

    expect(consultaPedidos.eq).toHaveBeenCalledWith(
      "restaurant_id",
      acceso.restauranteId,
    );
    expect(consultaPedidos.eq).toHaveBeenCalledWith(
      "qr_code_id",
      acceso.qrId,
    );
    expect(consultaPedidos.eq).toHaveBeenCalledWith(
      "idempotency_key",
      clave,
    );
    expect(consultaPedidos.eq).toHaveBeenCalledTimes(3);

    const seleccion = consultaPedidos.select.mock.calls[0][0];

    expect(seleccion.replace(/\s+/g, "")).toBe(
      "id,order_number,status,created_at,modality," +
      "dining_tables(number)," +
      "order_items(product_name,quantity)",
    );

    expect(cliente.from).toHaveBeenCalledExactlyOnceWith("orders");
  });

  it.each([
    { caso: "otro QR", cambios: { qr_code_id: "qr-mesa-2" } },
    {
      caso: "otro restaurante",
      cambios: { restaurant_id: "restaurante-2" },
    },
    {
      caso: "otra clave",
      cambios: {
        idempotency_key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    },
  ])("no devuelve el pedido de $caso", async ({ cambios }) => {
    simularSupabase([{ ...filaPedido, ...cambios }]);

    expect(await consultarPedidoCliente(token, clave)).toBeNull();
  });

  it("devuelve null cuando el pedido no existe", async () => {
    simularSupabase([]);

    expect(await consultarPedidoCliente(token, clave)).toBeNull();
  });

  it("no muestra mesa para pedidos para llevar", async () => {
    simularSupabase([
      {
        ...filaPedido,
        modality: "TAKEAWAY",
        dining_tables: null,
      },
    ]);

    expect(await consultarPedidoCliente(token, clave)).toMatchObject({
      modalidad: "TAKEAWAY",
      mesaNumero: null,
    });
  });

  it("consulta el último motivo de cancelación del pedido autorizado", async () => {
    const { consultaHistorial, cliente } = simularSupabase(
      [{ ...filaPedido, status: "CANCELLED" }],
      [
        {
          order_id: filaPedido.id,
          restaurant_id: acceso.restauranteId,
          to_status: "CANCELLED",
          reason: "Motivo anterior",
          created_at: "2026-11-01T18:01:00.000Z",
        },
        {
          order_id: filaPedido.id,
          restaurant_id: acceso.restauranteId,
          to_status: "CANCELLED",
          reason: "  Producto agotado  ",
          created_at: "2026-11-01T18:02:00.000Z",
        },
        {
          order_id: "otro-pedido",
          restaurant_id: acceso.restauranteId,
          to_status: "CANCELLED",
          reason: "Motivo de otro pedido",
          created_at: "2026-11-01T18:03:00.000Z",
        },
      ],
    );

    expect(await consultarPedidoCliente(token, clave)).toMatchObject({
      estado: "CANCELLED",
      motivo: "Producto agotado",
    });

    expect(consultaHistorial.select).toHaveBeenCalledExactlyOnceWith(
      "reason",
    );
    expect(consultaHistorial.eq).toHaveBeenCalledWith(
      "order_id",
      filaPedido.id,
    );
    expect(consultaHistorial.eq).toHaveBeenCalledWith(
      "restaurant_id",
      acceso.restauranteId,
    );
    expect(consultaHistorial.eq).toHaveBeenCalledWith(
      "to_status",
      "CANCELLED",
    );
    expect(consultaHistorial.order).toHaveBeenCalledWith(
      "created_at",
      { ascending: false },
    );
    expect(consultaHistorial.limit).toHaveBeenCalledWith(1);
    expect(cliente.from.mock.calls.map(([tabla]) => tabla)).toEqual([
      "orders",
      "order_status_history",
    ]);
  });

  it("no inventa un motivo cuando no hay uno registrado", async () => {
    simularSupabase([{ ...filaPedido, status: "CANCELLED" }]);

    expect(await consultarPedidoCliente(token, clave)).toMatchObject({
      estado: "CANCELLED",
      motivo: null,
    });
  });

  it("lanza un error si falla la consulta del pedido", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});

    simularSupabase([], [], {
      code: "XX001",
      message: "Información privada",
    });

    await expect(
      consultarPedidoCliente(token, clave),
    ).rejects.toThrow("No se pudo consultar el pedido.");

    expect(registro).toHaveBeenCalledExactlyOnceWith(
      "consultarPedidoCliente",
      "XX001",
    );
  });

  it("lanza un error si falla la consulta del motivo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    simularSupabase(
      [{ ...filaPedido, status: "CANCELLED" }],
      [],
      null,
      { code: "XX002" },
    );

    await expect(
      consultarPedidoCliente(token, clave),
    ).rejects.toThrow(
      "No se pudo consultar el motivo de cancelación.",
    );
  });

  it("no oculta los errores del servicio que valida el QR", async () => {
    vi.mocked(resolverAccesoQr).mockRejectedValue(
      new Error("No se pudo consultar el QR."),
    );

    await expect(
      consultarPedidoCliente(token, clave),
    ).rejects.toThrow("No se pudo consultar el QR.");

    expect(crearClienteAdmin).not.toHaveBeenCalled();
  });

  it("rechaza un estado desconocido", async () => {
    simularSupabase([{ ...filaPedido, status: "DESCONOCIDO" }]);

    await expect(
      consultarPedidoCliente(token, clave),
    ).rejects.toThrow("El estado del pedido no es válido.");
  });
});
