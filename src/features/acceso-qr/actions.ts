"use server";

import { refresh } from "next/cache";
import QRCode from "qrcode";
import { requerirRol } from "@/features/auth/sesion";
import { generarToken, hashToken } from "./token";
import { cambiarEstadoMesa, crearMesa, desactivarQr, reemplazarQr } from "./mesas";

// Solo OWNER o ADMIN. Devuelve el restaurante que administra.
async function restauranteDelAdmin(): Promise<string> {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) throw new Error("Sin permiso");
  return membresia.restaurantId;
}

export type EstadoNuevaMesa = { error: string | null };

export async function crearMesaAction(
  _anterior: EstadoNuevaMesa,
  formData: FormData,
): Promise<EstadoNuevaMesa> {
  const restauranteId = await restauranteDelAdmin();
  const localId = String(formData.get("localId") ?? "");
  const numero = Number(formData.get("numero"));

  if (!localId || !Number.isInteger(numero) || numero < 1 || numero > 999) {
    return { error: "Escribe un número de mesa entre 1 y 999." };
  }

  const resultado = await crearMesa(restauranteId, localId, numero);
  if (resultado === "DUPLICADO") return { error: `La mesa ${numero} ya existe en ese local.` };
  if (resultado === "ERROR") return { error: "No se pudo crear la mesa. Intenta de nuevo." };

  refresh();
  return { error: null };
}

export type ResultadoQr =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; numero: number; url: string; imagen: string };

export async function generarQrAction(
  _anterior: ResultadoQr,
  formData: FormData,
): Promise<ResultadoQr> {
  const restauranteId = await restauranteDelAdmin();
  const mesaId = String(formData.get("mesaId") ?? "");

  const token = generarToken();
  const resultado = await reemplazarQr(restauranteId, mesaId, hashToken(token));

  if (!resultado.ok) {
    const mensaje =
      resultado.motivo === "MESA_NO_DISPONIBLE"
        ? "Activa la mesa antes de generar su QR."
        : "No se pudo generar el QR. Intenta de nuevo.";
    return { estado: "error", mensaje };
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${base}/m/${token}`;
  const imagen = await QRCode.toDataURL(url, { width: 512, margin: 2 });

  refresh();
  return { estado: "listo", numero: resultado.numero, url, imagen };
}

export async function desactivarQrAction(formData: FormData): Promise<void> {
  const restauranteId = await restauranteDelAdmin();
  await desactivarQr(restauranteId, String(formData.get("mesaId") ?? ""));
  refresh();
}

export async function cambiarEstadoMesaAction(formData: FormData): Promise<void> {
  const restauranteId = await restauranteDelAdmin();
  const mesaId = String(formData.get("mesaId") ?? "");
  const activa = formData.get("activa") === "true";
  await cambiarEstadoMesa(restauranteId, mesaId, activa);
  refresh();
}