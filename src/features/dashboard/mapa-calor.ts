import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { rangoLimaAUtc } from "./ventas-logica";
import {
  calcularMapaCalor,
  type FiltroMapa,
} from "./mapa-calor-logica";

type PedidoConsultado = {
  id: string;
  status: string;
  created_at: string;
  order_items: {
    product_id: string;
    product_name: string;
  }[];
};

export type ResultadoMapa = ReturnType<typeof calcularMapaCalor> & {
  productos: {
    id: string;
    nombre: string;
  }[];
};

const TAMANO_PAGINA = 500;
const MAXIMO_INTENTOS = 2;

export async function obtenerMapaCalor(
  restauranteId: string,
  filtro: FiltroMapa,
): Promise<ResultadoMapa> {
  // Valida fechas, horario y producto antes de consultar.
  calcularMapaCalor([], filtro);

  if (!restauranteId.trim()) {
    throw new Error("No se pudo identificar el restaurante.");
  }

  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(
    filtro.desde,
    filtro.hasta,
  );

  try {
    const supabase = await crearClienteServidor();

    for (let intento = 0; intento < MAXIMO_INTENTOS; intento++) {
      const pedidos: PedidoConsultado[] = [];
      let inicio = 0;
      let totalEsperado: number | null = null;

      while (true) {
        const { data, error, count } = await supabase
          .from("orders")
          .select(
            "id, status, created_at, order_items(product_id, product_name)",
            { count: "exact" },
          )
          .eq("restaurant_id", restauranteId)
          .gte("created_at", desdeUtc)
          .lt("created_at", hastaUtcExclusivo)
          .order("id", { ascending: true })
          .range(inicio, inicio + TAMANO_PAGINA - 1)
          .overrideTypes<PedidoConsultado[], { merge: false }>();

        if (error) {
          console.error("obtenerMapaCalor", error.code);
          throw new Error("Consulta fallida.");
        }

        if (
          data === null ||
          count === null ||
          !Number.isSafeInteger(count) ||
          count < 0
        ) {
          throw new Error("Consulta incompleta.");
        }

        // Repite desde el inicio si cambia la cantidad de pedidos.
        if (totalEsperado !== null && count !== totalEsperado) {
          break;
        }

        totalEsperado = count;
        pedidos.push(...data);
        inicio += data.length;

        if (inicio > totalEsperado) {
          throw new Error("La consulta devolvió datos inconsistentes.");
        }

        if (inicio === totalEsperado) {
          return prepararResultado(pedidos, filtro);
        }

        if (data.length === 0) {
          throw new Error("Faltan pedidos por consultar.");
        }
      }
    }

    throw new Error("Los pedidos cambiaron durante la consulta.");
  } catch {
    throw new Error(
      "No se pudo consultar el mapa de calor. Intenta de nuevo.",
    );
  }
}

function prepararResultado(
  pedidos: PedidoConsultado[],
  filtro: FiltroMapa,
): ResultadoMapa {
  const ids = new Set<string>();

  for (const pedido of pedidos) {
    if (ids.has(pedido.id)) {
      throw new Error("La consulta devolvió pedidos repetidos.");
    }

    ids.add(pedido.id);

    if (
      typeof pedido.status !== "string" ||
      !pedido.status ||
      !Array.isArray(pedido.order_items) ||
      pedido.order_items.some((item) =>
        typeof item.product_id !== "string" ||
        !item.product_id.trim() ||
        typeof item.product_name !== "string" ||
        !item.product_name.trim(),
      )
    ) {
      throw new Error("El pedido contiene datos incompletos.");
    }
  }

  const mapa = calcularMapaCalor(
    pedidos.map((pedido) => ({
      id: pedido.id,
      creadoEn: pedido.created_at,
      cancelado: pedido.status === "CANCELLED",
      productos: pedido.order_items.map((item) => item.product_id),
    })),
    filtro,
  );

  // El selector incluye todos los platos de pedidos no cancelados
  // del periodo, aunque se esté filtrando el mapa por un plato.
  const productos = new Map<string, string>();
  const porFecha = [...pedidos].sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id.localeCompare(b.id),
  );

  for (const pedido of porFecha) {
    if (pedido.status === "CANCELLED") continue;

    for (const item of pedido.order_items) {
      productos.set(item.product_id, item.product_name);
    }
  }

  return {
    ...mapa,
    productos: [...productos].map(([id, nombre]) => ({
      id,
      nombre,
    })).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es") ||
      a.id.localeCompare(b.id),
    ),
  };
}