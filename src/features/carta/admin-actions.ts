"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import {
  cambiarActivo,
  cambiarDisponibilidad,
  crearProducto,
  editarProducto,
} from "./admin-productos";
import { validarProducto } from "./validar-producto";

// Forma de UUID sin exigir versión: los IDs del seed no son v4 y Postgres valida el resto.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function restauranteDelAdmin(): Promise<string> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find(
    (m) => m.rol === "OWNER" || m.rol === "ADMIN",
  );
  if (!membresia) throw new Error("Sin permiso");
  return membresia.restaurantId;
}

export type EstadoFormularioProducto = {
  tipo: "inicial" | "exito" | "error";
  mensaje: string;
};

function entradaFormulario(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    precio: formData.get("precio"),
    categoriaId: formData.get("categoriaId"),
    descripcion: formData.get("descripcion"),
    ingredientes: formData.get("ingredientes"),
    alergenos: formData.get("alergenos"),
    imageUrl: formData.get("imageUrl"),
  };
}

export async function guardarProductoAction(
  _anterior: EstadoFormularioProducto,
  formData: FormData,
): Promise<EstadoFormularioProducto> {
  const restauranteId = await restauranteDelAdmin();
  const validacion = validarProducto(entradaFormulario(formData));
  if (!validacion.ok) {
    return {
      tipo: "error",
      mensaje: Object.values(validacion.errores).filter(Boolean).join(" "),
    };
  }

  const productoId = String(formData.get("productoId") ?? "").trim();
  if (productoId && !UUID.test(productoId)) {
    return { tipo: "error", mensaje: "No se pudo identificar el producto." };
  }

  const resultado = productoId
    ? await editarProducto(restauranteId, productoId, validacion.producto)
    : await crearProducto(restauranteId, validacion.producto);

  if (resultado === "DUPLICADO") {
    return { tipo: "error", mensaje: "Ya existe un producto con ese nombre." };
  }
  if (resultado === "NO_ENCONTRADO") {
    return { tipo: "error", mensaje: "No se encontró el producto en este restaurante." };
  }
  if (resultado === "ERROR") {
    return { tipo: "error", mensaje: "No se pudo guardar el producto. Intenta de nuevo." };
  }

  refresh();
  return {
    tipo: "exito",
    mensaje: productoId ? "Producto actualizado." : "Producto creado.",
  };
}

async function datosCambio(formData: FormData) {
  const restauranteId = await restauranteDelAdmin();
  const productoId = String(formData.get("productoId") ?? "").trim();
  const valorTexto = String(formData.get("valor") ?? "");
  if (!UUID.test(productoId) || (valorTexto !== "true" && valorTexto !== "false")) {
    return null;
  }
  return { restauranteId, productoId, valor: valorTexto === "true" };
}

export async function cambiarDisponibilidadAction(formData: FormData): Promise<void> {
  const cambio = await datosCambio(formData);
  if (!cambio) return;
  if (await cambiarDisponibilidad(cambio.restauranteId, cambio.productoId, cambio.valor)) {
    refresh();
  }
}

export async function cambiarActivoAction(formData: FormData): Promise<void> {
  const cambio = await datosCambio(formData);
  if (!cambio) return;
  if (await cambiarActivo(cambio.restauranteId, cambio.productoId, cambio.valor)) {
    refresh();
  }
}
