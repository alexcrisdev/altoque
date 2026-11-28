"use server";

import { resolverAccesoQr } from "./acceso";
import { buscarSesionAbierta } from "../mesero/sesiones";

// US-036: el cliente pregunta cada 5 s si el mesero ya habilitó su mesa. Usa el MISMO token
// del QR (la mesa sale del token, nunca del navegador) y solo responde sí/no: nada de otras
// mesas ni del pedido. Confirmar el pedido vuelve a validar la sesión en el servidor.
export async function consultarMesaHabilitadaAction(token: string): Promise<{ habilitada: boolean }> {
  if (typeof token !== "string") return { habilitada: false };
  try {
    const acceso = await resolverAccesoQr(token);
    if (acceso.estado !== "VALIDO") return { habilitada: false };
    if (acceso.modalidad === "TAKEAWAY") return { habilitada: true };
    if (!acceso.mesa) return { habilitada: false };
    return { habilitada: (await buscarSesionAbierta(acceso.mesa.id)) !== null };
  } catch {
    return { habilitada: false }; // sin conexión: se vuelve a preguntar en 5 s
  }
}
