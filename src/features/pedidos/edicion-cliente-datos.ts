import "server-only";

import { hashToken, tokenConFormatoValido } from "../acceso-qr/token";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { esClavePedido } from "./calificacion-logica";
import type { CambioPedido, ItemModificable } from "./modificacion";

export type EdicionCliente = { items: ItemModificable[]; revision: string };
type EstadoEdicion = EdicionCliente | { bloqueo: string };
type CambioCliente = { cancelado: boolean; totalCentimos: number };

function credenciales(token: unknown, clave: unknown) {
  if (typeof token !== "string" || !tokenConFormatoValido(token) || !esClavePedido(clave)) return null;
  return { p_token_hash: hashToken(token), p_clave: clave };
}

export async function leerEdicionPedidoCliente(token: string, clave: string): Promise<EstadoEdicion | null> {
  const entrada = credenciales(token, clave);
  if (!entrada) return null;
  const { data, error } = await crearClienteAdmin().rpc("leer_edicion_pedido_cliente", entrada);
  if (error) throw new Error("No se pudo consultar la edición del pedido.");
  return data as EstadoEdicion | null;
}

export async function guardarEdicionPedidoCliente(
  token: unknown, clave: unknown, revision: unknown, cambios: CambioPedido[], confirmarAnulacion: boolean,
): Promise<{ ok: true; cambio: CambioCliente } | { ok: false; codigo: string }> {
  const entrada = credenciales(token, clave);
  if (!entrada) return { ok: false, codigo: "ORDER_NOT_FOUND" };
  if (typeof revision !== "string" || !/^[a-f0-9]{32}$/.test(revision)
    || !Array.isArray(cambios) || cambios.length === 0 || typeof confirmarAnulacion !== "boolean") {
    return { ok: false, codigo: "INVALID_CHANGES" };
  }
  const { data, error } = await crearClienteAdmin().rpc("modificar_pedido_cliente", {
    ...entrada, p_revision: revision, p_cambios: cambios, p_confirmar_anulacion: confirmarAnulacion,
  });
  if (error?.code === "55P03" || error?.code === "40P01") return { ok: false, codigo: "ORDER_BUSY" };
  if (error?.message.startsWith("STOCK_INSUFFICIENT:")) return { ok: false, codigo: "STOCK_INSUFFICIENT" };
  return error || !data
    ? { ok: false, codigo: error?.message ?? "" }
    : { ok: true, cambio: data as CambioCliente };
}
