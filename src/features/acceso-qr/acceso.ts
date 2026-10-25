import "server-only";
import { buscarQrPorHash } from "./qr";
import { hashToken, tokenConFormatoValido } from "./token";

export type ResultadoAcceso =
  | { estado: "INVALIDO" }
  | { estado: "DESHABILITADO" }
  | {
      estado: "VALIDO";
      qrId: string;
      modalidad: "DINE_IN" | "TAKEAWAY";
      restauranteId: string;
      restauranteNombre: string;
      localId: string;
      localNombre: string;
      mesa: { id: string; numero: number } | null;
    };

// Reglas: decide si un token da acceso y a qué mesa/local.
// La mesa SIEMPRE sale del token, nunca de lo que mande el navegador.
export async function resolverAccesoQr(token: string): Promise<ResultadoAcceso> {
  if (!tokenConFormatoValido(token)) return { estado: "INVALIDO" };

  const qr = await buscarQrPorHash(hashToken(token));
  if (!qr) return { estado: "INVALIDO" };

  const local = qr.branches;
  const restaurante = local.restaurants;
  const mesa = qr.dining_tables;

  const deshabilitado =
    !qr.active ||
    !local.active ||
    !restaurante.active ||
    (qr.purpose === "DINE_IN" && (!mesa || !mesa.active));

  if (deshabilitado) return { estado: "DESHABILITADO" };

  return {
    estado: "VALIDO",
    qrId: qr.id,
    modalidad: qr.purpose,
    restauranteId: qr.restaurant_id,
    restauranteNombre: restaurante.name,
    localId: qr.branch_id,
    localNombre: local.name,
    mesa:
      qr.purpose === "DINE_IN" && mesa && qr.dining_table_id
        ? { id: qr.dining_table_id, numero: mesa.number }
        : null,
  };
}