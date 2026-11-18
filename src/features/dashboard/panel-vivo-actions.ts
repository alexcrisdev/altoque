"use server";

import { requerirRol } from "../auth/sesion";
import { obtenerPanelVivo, type PanelVivo } from "./panel-vivo";

export type ResultadoPanelVivo = { ok: true; panel: PanelVivo } | { ok: false; mensaje: string };

// US-099: solo OWNER/ADMIN; lectura con su sesión (RLS), sin service role.
export async function consultarPanelVivoAction(): Promise<ResultadoPanelVivo> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((fila) => fila.rol === "OWNER")
    ?? sesion.membresias.find((fila) => fila.rol === "ADMIN");
  if (!membresia) return { ok: false, mensaje: "No se pudo identificar el restaurante autorizado." };
  try {
    return { ok: true, panel: await obtenerPanelVivo(membresia.restaurantId) };
  } catch {
    return { ok: false, mensaje: "No se pudo cargar el panel. Reintentando…" };
  }
}
