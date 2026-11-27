"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { armarQr } from "./imagen-qr";
import { generarToken, hashToken, tokenDeQr } from "./token";
import { cambiarEstadoMesa, crearMesa, desactivarQr, editarFormaMesa, reemplazarQr } from "./mesas";
import { validarFormaSillas } from "../plano-mesas/sillas";

// Forma de UUID sin exigir versión: los IDs del seed no son v4 y Postgres valida el resto.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { desactivarQrMostrador, reemplazarQrMostrador } from "./mostrador";

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
  const mesa = validarFormaSillas(formData.get("forma"), formData.get("sillas"));
  if (!mesa.ok) return { error: mesa.mensaje };

  const resultado = await crearMesa(restauranteId, localId, numero, mesa.forma, mesa.sillas);
  if (resultado === "DUPLICADO") return { error: `La mesa ${numero} ya existe en ese local.` };
  if (resultado === "ERROR") return { error: "No se pudo crear la mesa. Intenta de nuevo." };

  refresh();
  return { error: null };
}

export type EstadoFormaMesa = { tipo: "inicial" | "exito" | "error"; mensaje: string };

// Plano: dueño o admin cambian la forma y las sillas de una mesa de su restaurante.
// Solo cambia el dibujo: la mesa sigue con su número, su QR y su cuenta.
export async function editarFormaMesaAction(
  _anterior: EstadoFormaMesa,
  formData: FormData,
): Promise<EstadoFormaMesa> {
  const restauranteId = await restauranteDelAdmin();
  const mesaId = String(formData.get("mesaId") ?? "");
  if (!UUID.test(mesaId)) return { tipo: "error", mensaje: "No se pudo identificar la mesa." };
  const mesa = validarFormaSillas(formData.get("forma"), formData.get("sillas"));
  if (!mesa.ok) return { tipo: "error", mensaje: mesa.mensaje };

  const resultado = await editarFormaMesa(restauranteId, mesaId, mesa.forma, mesa.sillas);
  if (resultado === "NO_ENCONTRADA") return { tipo: "error", mensaje: "No se encontró la mesa en este restaurante." };
  if (resultado === "ERROR") return { tipo: "error", mensaje: "No se pudo guardar la mesa. Intenta de nuevo." };

  refresh();
  return { tipo: "exito", mensaje: "Mesa actualizada en el plano." };
}

export type ResultadoQr =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; etiqueta: string; url: string; imagen: string; guardado: boolean };

// US-096: id y token del QR nuevo. Con QR_TOKEN_SECRET el token es HMAC(secreto, id) y el QR
// se puede volver a mostrar; sin el secreto se usa un token aleatorio (no se vuelve a mostrar).
function nuevoQr(): { qrId: string; token: string; guardado: boolean } {
  const qrId = randomUUID();
  const calculado = tokenDeQr(qrId);
  return calculado
    ? { qrId, token: calculado, guardado: true }
    : { qrId, token: generarToken(), guardado: false };
}

export async function generarQrAction(
  _anterior: ResultadoQr,
  formData: FormData,
): Promise<ResultadoQr> {
  const restauranteId = await restauranteDelAdmin();
  const mesaId = String(formData.get("mesaId") ?? "");

  const { qrId, token, guardado } = nuevoQr();
  const resultado = await reemplazarQr(restauranteId, mesaId, qrId, hashToken(token));

  if (!resultado.ok) {
    const mensaje =
      resultado.motivo === "MESA_NO_DISPONIBLE"
        ? "Activa la mesa antes de generar su QR."
        : "No se pudo generar el QR. Intenta de nuevo.";
    return { estado: "error", mensaje };
  }

  const { url, imagen } = await armarQr(token);

  refresh();
  return { estado: "listo", etiqueta: `mesa ${resultado.numero}`, url, imagen, guardado };
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

export async function generarQrMostradorAction(
  _anterior: ResultadoQr,
  formData: FormData,
): Promise<ResultadoQr> {
  const restauranteId = await restauranteDelAdmin();
  const localId = String(formData.get("localId") ?? "");

  const { qrId, token, guardado } = nuevoQr();
  const resultado = await reemplazarQrMostrador(restauranteId, localId, qrId, hashToken(token));

  if (!resultado.ok) {
    const mensaje =
      resultado.motivo === "LOCAL_NO_DISPONIBLE"
        ? "Este local no está disponible."
        : "No se pudo generar el QR. Intenta de nuevo.";
    return { estado: "error", mensaje };
  }

  const { url, imagen } = await armarQr(token);

  refresh();
  return { estado: "listo", etiqueta: `mostrador ${resultado.local}`, url, imagen, guardado };
}

export async function desactivarQrMostradorAction(formData: FormData): Promise<void> {
  const restauranteId = await restauranteDelAdmin();
  await desactivarQrMostrador(restauranteId, String(formData.get("localId") ?? ""));
  refresh();
}
