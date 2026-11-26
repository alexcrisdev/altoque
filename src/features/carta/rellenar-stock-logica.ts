import {
  redondearCantidadPrevista,
  seleccionarPrediccionPorPlato,
  type PrediccionPlato,
} from "../dashboard/prediccion-logica";

const MAXIMO = 2147483647;

// MAE 4,26 de US-087 redondeado hacia arriba.
// Es un margen orientativo, no un intervalo de confianza.
const MARGEN_ORIENTATIVO = 5;

export type SugerenciaStock = {
  productoId: string;
  cantidad: number;
  minimo: number;
  maximo: number;
  modelo: string;
};

export type ProductoStockEditable = {
  id: string;
  name: string;
  cantidad: number | null;
  vendidos: number;
};

export type CampoStock = {
  productoId: string;
  nombre: string;
  vendidos: number;
  valor: string;
  origen: "registrado" | "prediccion" | "editado" | "sin_prediccion";
};

export type EstadoRellenoStock = {
  campos: readonly CampoStock[];
  anteriores: readonly CampoStock[] | null;
};

export function crearSugerenciasStock(
  predicciones: readonly PrediccionPlato[],
  fecha: string,
): SugerenciaStock[] {
  // US-146: una predicción por plato (propia, otra real o demo), la misma
  // selección que la tarjeta de mañana. Un plato sin datos conserva su demo.
  return seleccionarPrediccionPorPlato(predicciones, fecha).map(fila => {
    const cantidad = redondearCantidadPrevista(fila.cantidadPrevista);

    return {
      productoId: fila.productoId,
      cantidad,
      modelo: fila.modelo,
      minimo: Math.max(0, cantidad - MARGEN_ORIENTATIVO),
      maximo: Math.min(MAXIMO, cantidad + MARGEN_ORIENTATIVO),
    };
  });
}

export function crearEstadoStock(
  productos: readonly ProductoStockEditable[],
): EstadoRellenoStock {
  const ids = new Set<string>();

  const campos = productos.map(producto => {
    if (
      !producto.id?.trim() ||
      ids.has(producto.id) ||
      !producto.name?.trim() ||
      !Number.isSafeInteger(producto.vendidos) ||
      producto.vendidos < 0 ||
      producto.vendidos > MAXIMO ||
      (
        producto.cantidad !== null &&
        (
          !Number.isSafeInteger(producto.cantidad) ||
          producto.cantidad < producto.vendidos ||
          producto.cantidad > MAXIMO
        )
      )
    ) {
      throw new Error("Los datos del stock no son válidos.");
    }

    ids.add(producto.id);

    return {
      productoId: producto.id,
      nombre: producto.name,
      vendidos: producto.vendidos,
      valor: producto.cantidad === null ? "" : String(producto.cantidad),
      origen: "registrado" as const,
    };
  });

  return { campos, anteriores: null };
}

export function rellenarStockConPrediccion(
  estado: EstadoRellenoStock,
  sugerencias: readonly SugerenciaStock[],
): EstadoRellenoStock {
  const porProducto = new Map<string, SugerenciaStock>();

  for (const sugerencia of sugerencias) {
    if (
      !sugerencia.productoId?.trim() ||
      porProducto.has(sugerencia.productoId) ||
      redondearCantidadPrevista(sugerencia.cantidad) !== sugerencia.cantidad
    ) {
      throw new Error("Las sugerencias de stock no son válidas.");
    }

    porProducto.set(sugerencia.productoId, sugerencia);
  }

  if (!estado.campos.some(campo => porProducto.has(campo.productoId))) {
    return estado;
  }

  return {
    anteriores: estado.campos.map(campo => ({ ...campo })),
    campos: estado.campos.map(campo => {
      const sugerencia = porProducto.get(campo.productoId);

      if (!sugerencia) return { ...campo };

      return {
        ...campo,
        valor: String(sugerencia.cantidad),
        origen: "prediccion",
      };
    }),
  };
}

export function editarCantidadStock(
  estado: EstadoRellenoStock,
  productoId: string,
  valor: string,
): EstadoRellenoStock {
  if (
    typeof valor !== "string" ||
    !estado.campos.some(campo => campo.productoId === productoId)
  ) {
    throw new Error("No se pudo identificar el campo de stock.");
  }

  // Las cantidades se validan al guardar con la lógica existente.
  return {
    ...estado,
    campos: estado.campos.map(campo =>
      campo.productoId === productoId
        ? { ...campo, valor, origen: "editado" }
        : campo,
    ),
  };
}

export function deshacerRellenoStock(
  estado: EstadoRellenoStock,
): EstadoRellenoStock {
  if (estado.anteriores === null) return estado;

  return {
    campos: estado.anteriores.map(campo => ({ ...campo })),
    anteriores: null,
  };
}