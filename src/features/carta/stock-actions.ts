"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { fechaActualLima, validarStockDiario } from "./validar-stock";
import { guardarStockDiario, listarProductosConStock } from "./stock-diario";

export type EstadoGuardarStock = { tipo: "inicial" | "exito" | "error"; mensaje: string };

export async function guardarStockAction(
  _estado: EstadoGuardarStock,
  formData: FormData,
): Promise<EstadoGuardarStock> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return { tipo: "error", mensaje: "No tienes permiso para guardar el stock." };

  const ids = formData.getAll("productoId");
  const cantidades = formData.getAll("cantidad");
  if (ids.length !== cantidades.length || ids.length === 0) {
    return { tipo: "error", mensaje: "No se recibió una lista válida de productos." };
  }
  const entradas = ids.map((productoId, indice) => ({ productoId, cantidad: cantidades[indice] }));
  const fecha = fechaActualLima();
  const productos = await listarProductosConStock(membresia.restaurantId, fecha);
  const vendidos = new Map(productos.map((producto) => [producto.id, producto.vendidos]));
  const validacion = validarStockDiario(entradas, vendidos);
  if (!validacion.ok) return { tipo: "error", mensaje: validacion.mensaje };
  if (validacion.items.length !== productos.length || productos.some((p) => !validacion.items.some((i) => i.productoId === p.id))) {
    return { tipo: "error", mensaje: "La lista de productos cambió. Recarga la página e intenta de nuevo." };
  }

  const error = await guardarStockDiario(membresia.restaurantId, fecha, validacion.items);
  if (error) return { tipo: "error", mensaje: error };
  refresh();
  return { tipo: "exito", mensaje: "Stock del día guardado." };
}
