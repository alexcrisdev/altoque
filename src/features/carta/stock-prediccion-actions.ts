"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerPrediccionesFecha } from "../dashboard/prediccion";
import {
  listarProductosConStock,
  type ProductoConStock,
} from "./stock-diario";
import {
  crearSugerenciasStock,
  type SugerenciaStock,
} from "./rellenar-stock-logica";
import { fechaActualLima } from "./validar-stock";
import {
  guardarStockAction,
  type EstadoGuardarStock,
} from "./stock-actions";

export type ResultadoStockPrediccion =
  | {
      ok: true;
      fecha: string;
      productos: ProductoConStock[];
      sugerencias: SugerenciaStock[];
      avisoPrediccion: string | null;
    }
  | {
      ok: false;
      mensaje: string;
    };

export async function consultarStockConPrediccionAction():
  Promise<ResultadoStockPrediccion> {
  // Conservar las redirecciones de autenticación fuera del try.
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find(
    (m) => m.rol === "OWNER" || m.rol === "ADMIN",
  );

  if (!membresia) {
    return {
      ok: false,
      mensaje: "No se pudo identificar el restaurante autorizado.",
    };
  }

  const fecha = fechaActualLima();

  try {
    const productos = await listarProductosConStock(
      membresia.restaurantId,
      fecha,
    );

    let sugerencias: SugerenciaStock[] = [];
    let avisoPrediccion: string | null = null;

    try {
      const previstas = await obtenerPrediccionesFecha(
        membresia.restaurantId,
        fecha,
      );

      const activos = new Set(productos.map((producto) => producto.id));

      sugerencias = crearSugerenciasStock(previstas, fecha).filter(
        (fila) => activos.has(fila.productoId),
      );
    } catch {
      avisoPrediccion =
        "No se pudo consultar la predicción de hoy. " +
        "Puedes registrar el stock manualmente.";
    }

    return {
      ok: true,
      fecha,
      productos,
      sugerencias,
      avisoPrediccion,
    };
  } catch {
    return {
      ok: false,
      mensaje: "No se pudo cargar el stock del día. Intenta de nuevo.",
    };
  }
}

export async function guardarStockConPrediccionAction(
  estado: EstadoGuardarStock,
  formData: FormData,
): Promise<EstadoGuardarStock> {
  await requerirRol(["OWNER", "ADMIN"]);

  const fechas = formData.getAll("fecha");

  // Evita guardar sugerencias de ayer si el formulario quedó abierto.
  if (fechas.length !== 1 || fechas[0] !== fechaActualLima()) {
    return {
      tipo: "error",
      mensaje:
        "La fecha del formulario cambió. Recarga la página " +
        "antes de guardar el stock de hoy.",
    };
  }

  // Reutiliza los permisos, validaciones y guardar_stock_diario existentes.
  return guardarStockAction(estado, formData);
}
