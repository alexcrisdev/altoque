"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { guardarConfigParaLlevar } from "./para-llevar";

export type EstadoConfigParaLlevar = { tipo: "inicial" | "exito" | "error"; mensaje: string };

// Solo OWNER o ADMIN. El restaurante sale de la sesión, nunca del formulario.
export async function guardarConfigParaLlevarAction(
  _anterior: EstadoConfigParaLlevar,
  formData: FormData,
): Promise<EstadoConfigParaLlevar> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return { tipo: "error", mensaje: "Sin permiso." };

  const guardado = await guardarConfigParaLlevar(membresia.restaurantId, {
    pideNombre: formData.get("pideNombre") === "on",
    pideTelefono: formData.get("pideTelefono") === "on",
  });
  if (!guardado) return { tipo: "error", mensaje: "No se pudo guardar. Intenta de nuevo." };

  refresh();
  return { tipo: "exito", mensaje: "Configuración guardada." };
}
