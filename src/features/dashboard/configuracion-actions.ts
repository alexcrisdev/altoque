"use server";

import { revalidatePath } from "next/cache";
import { requerirRol } from "../auth/sesion";
import { guardarCobroAnticipado, obtenerCobroAnticipado } from "./configuracion-restaurante";

function restauranteAutorizado(membresias: Awaited<ReturnType<typeof requerirRol>>["membresias"]): string {
  const membresia = membresias.find((m) => m.rol === "OWNER")
    ?? membresias.find((m) => m.rol === "ADMIN");
  if (!membresia) throw new Error("No se pudo identificar el restaurante autorizado.");
  return membresia.restaurantId;
}

export async function consultarCobroAnticipadoAction(): Promise<boolean> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  return obtenerCobroAnticipado(restauranteAutorizado(sesion.membresias));
}

export async function actualizarCobroAnticipadoAction(formData: FormData): Promise<void> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const valor = formData.get("activo");
  if (valor !== "true" && valor !== "false") throw new Error("El valor del ajuste no es válido.");

  await guardarCobroAnticipado(restauranteAutorizado(sesion.membresias), valor === "true");
  revalidatePath("/admin");
}
