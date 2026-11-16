import {
  calcularResumenVentas,
  rangoLimaAUtc,
  type PagoVenta,
} from "./ventas-logica";
import {
  calcularProductosMasVendidos,
  type PedidoTendencia,
} from "./tendencias-logica";
import {
  fechaMananaLima,
  nombreDiaPrediccion,
  topPlatosPrevistos,
  type PrediccionPlato,
} from "./prediccion-logica";

export type PagoResumenDiario = PagoVenta & {
  id: string;
  confirmed_at: string | null;
  stripe_session_id: string | null;
};

export type CierreResumenDiario = {
  id: string;
  kind: "ORDINARY" | "EXCEPTION";
  reason: string | null;
  closed_at: string;
};

export type DatosResumenDiario = {
  restaurante: {
    id: string;
    nombre: string;
  };
  fecha: string;
  pagos: readonly PagoResumenDiario[];
  pedidos: readonly PedidoTendencia[];
  cierres: readonly CierreResumenDiario[];
  predicciones: readonly PrediccionPlato[];
};

export type ResumenDiario = {
  restaurante: {
    id: string;
    nombre: string;
  };
  fecha: string;
  total_vendido: number;
  pedidos: number;
  ventas_por_metodo: {
    efectivo: number;
    yape: number;
    tarjeta_caja: number;
    tarjeta_en_linea: number;
  };
  plato_mas_vendido: {
    nombre: string;
    cantidad: number;
  } | null;
  cierres_con_excepcion: {
    cantidad: number;
    motivos: string[];
  };
  manana_prepara: {
    nombre: string;
    cantidad: number;
    fecha: string;
    dia: string;
    modelo: string;
  }[];
};

export function fechaSiguienteResumen(fecha: string): string {
  rangoLimaAUtc(fecha, fecha);

  // Mediodía UTC pertenece a la misma fecha en Lima.
  return fechaMananaLima(new Date(`${fecha}T12:00:00.000Z`));
}

function instanteConZona(fecha: string | null): number {
  if (
    typeof fecha !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(fecha)
  ) {
    throw new Error(
      "La fecha del registro debe incluir su zona horaria.",
    );
  }

  const instante = Date.parse(fecha);

  if (!Number.isFinite(instante)) {
    throw new Error("La fecha del registro no es válida.");
  }

  // Evita aceptar días inexistentes normalizados por Date.parse.
  rangoLimaAUtc(fecha.slice(0, 10), fecha.slice(0, 10));

  return instante;
}

function sinDuplicados(filas: readonly { id: string }[]): void {
  const ids = new Set<string>();

  for (const fila of filas) {
    if (
      typeof fila.id !== "string" ||
      !fila.id.trim() ||
      ids.has(fila.id)
    ) {
      throw new Error(
        "La consulta contiene identificadores ausentes o duplicados.",
      );
    }

    ids.add(fila.id);
  }
}

// Función pura: no consulta la base ni devuelve datos de clientes.
// La capa de datos debe entregar filas del restaurante solicitado.
export function calcularResumenDiario(
  datos: DatosResumenDiario,
): ResumenDiario {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(
    datos.fecha,
    datos.fecha,
  );

  const inicio = Date.parse(desdeUtc);
  const fin = Date.parse(hastaUtcExclusivo);

  const delDia = (fecha: string | null) => {
    const instante = instanteConZona(fecha);
    return instante >= inicio && instante < fin;
  };

  if (
    !datos.restaurante.id?.trim() ||
    !datos.restaurante.nombre?.trim()
  ) {
    throw new Error("No se pudo identificar el restaurante.");
  }

  sinDuplicados(datos.pagos);
  sinDuplicados(datos.pedidos);
  sinDuplicados(datos.cierres);

  const pagos = datos.pagos.filter(
    pago =>
      pago.status === "CONFIRMED" &&
      delDia(pago.confirmed_at),
  );

  for (const pago of pagos) {
    if (
      pago.stripe_session_id !== null &&
      (
        typeof pago.stripe_session_id !== "string" ||
        !pago.stripe_session_id.trim() ||
        pago.method !== "CARD"
      )
    ) {
      throw new Error("El canal del pago no es válido.");
    }
  }

  const resumenVentas = calcularResumenVentas(pagos);

  const ventasCaja = calcularResumenVentas(
    pagos.filter(pago => pago.stripe_session_id === null),
  );

  const pedidos = datos.pedidos.filter(
    pedido => delDia(pedido.created_at),
  );

  const productos = calcularProductosMasVendidos(
    pedidos,
    1,
    "nombre",
  );

  const cierres = datos.cierres.filter(
    cierre =>
      cierre.kind === "EXCEPTION" &&
      delDia(cierre.closed_at),
  );

  const motivos = cierres.map(cierre => {
    if (
      typeof cierre.reason !== "string" ||
      !cierre.reason.trim()
    ) {
      throw new Error("El cierre con excepción no tiene motivo.");
    }

    return cierre.reason;
  });

  const manana = fechaSiguienteResumen(datos.fecha);
  const previstos = topPlatosPrevistos(
    datos.predicciones,
    manana,
    3,
  );

  return {
    restaurante: {
      id: datos.restaurante.id,
      nombre: datos.restaurante.nombre,
    },
    fecha: datos.fecha,
    total_vendido: resumenVentas.ventasCentimos / 100,
    pedidos: pedidos.filter(
      pedido => pedido.status !== "CANCELLED",
    ).length,
    ventas_por_metodo: {
      efectivo: resumenVentas.porMetodo.CASH / 100,
      yape: resumenVentas.porMetodo.YAPE / 100,
      tarjeta_caja: ventasCaja.porMetodo.CARD / 100,
      tarjeta_en_linea:
        (
          resumenVentas.porMetodo.CARD -
          ventasCaja.porMetodo.CARD
        ) / 100,
    },
    plato_mas_vendido: productos[0]
      ? {
          nombre: productos[0].nombre,
          cantidad: productos[0].unidades,
        }
      : null,
    cierres_con_excepcion: {
      cantidad: cierres.length,
      motivos,
    },
    manana_prepara: previstos.map(plato => ({
      nombre: plato.nombre,
      cantidad: plato.cantidadPrevista,
      fecha: manana,
      dia: nombreDiaPrediccion(manana),
      modelo: plato.modelo,
    })),
  };
}
